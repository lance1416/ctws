import { expect, test, type Page } from '@playwright/test'
import { holdFirstRead, registerFreshUser, slowReads, WEB } from './helpers'

/**
 * THE READING LIST -- THE SECOND MODULE, through the browser.
 *
 * What is under test here is mostly not the list: it is the SEAM. A second module contributed a
 * rail row, a chord, a search provider, a project block and a capture rule, and the shell was not
 * edited to make room for any of them. The capture rule is the one that could not exist before --
 * with one module there was nothing to route to.
 */

const capture = (page: Page) => page.getByLabel('Capture')
const rowOf = (page: Page, text: string) =>
  page.getByRole('listitem').filter({ hasText: text }).first()

async function captureLine(page: Page, line: string) {
  const posted = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      /\/api\/v1\/(tasks|reading)$/.test(new URL(r.url()).pathname),
  )
  await capture(page).fill(line)
  await capture(page).press('Enter')
  return posted
}

test('a pasted link goes to Reading; a sentence still goes to the inbox', async ({ page }) => {
  // THE WHOLE POINT OF THE SECOND MODULE'S CAPTURE RULE, and the one thing that could not be
  // tested while only one module could take a line.
  await registerFreshUser(page)

  const toReading = await captureLine(page, 'https://linear.invalid/now/redesign')
  expect(new URL(toReading.url()).pathname).toBe('/api/v1/reading')
  await expect(page.getByText('Added to')).toContainText('Reading')

  const toInbox = await captureLine(page, '看看这篇 https://linear.invalid/now/redesign')
  expect(new URL(toInbox.url()).pathname).toBe('/api/v1/tasks')
  await expect(page.getByText('Added to')).toContainText('Inbox')
})

/**
 * Added while the list's first read is still out: it is on the list when that read lands. The
 * refetch after the write used to be handed the read that left before it, and the book was in the
 * database and nowhere on the screen.
 */
test('a book added while the list is still loading is on the list', async ({ page }) => {
  await registerFreshUser(page, '/')
  const release = await holdFirstRead(page, '**/api/v1/reading')
  await page.goto('/reading')
  const made = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/api\/v1\/reading$/.test(r.url()),
  )
  await page.getByLabel('Add to the reading list').fill('The Elements of Typographic Style')
  await page.getByLabel('Add to the reading list').press('Enter')
  await made
  release()
  await expect(page.getByRole('main')).toContainText('The Elements of Typographic Style')
})

test('an untitled link is listed by host and path', async ({ page }) => {
  await registerFreshUser(page)
  await page.request.post('/api/v1/reading', {
    headers: WEB,
    data: { kind: 'link', url: 'https://www.linear.invalid/now/how-we-redesigned-issues' },
  })
  await page.goto('/reading')

  // A pasted link shows its HOST AND PATH -- the host alone ("x.com", "github.com") does not
  // say which tweet or which repo, so a row of it carries no information at all.
  const row = rowOf(page, 'linear.invalid/now/how-we-redesigned-issues')
  await expect(row.getByRole('link')).toHaveText('linear.invalid/now/how-we-redesigned-issues')
  // And the line under it does not repeat what the line above already says.
  await expect(row.getByText('linear.invalid', { exact: true })).toHaveCount(0)
  await expect(row.getByRole('link')).toHaveAttribute(
    'href',
    'https://www.linear.invalid/now/how-we-redesigned-issues',
  )
  // And it opens away from the workspace, so a half-read list is not lost.
  await expect(row.getByRole('link')).toHaveAttribute('target', '_blank')
})

test('a book moves to read → reading → finished, and the finished pile folds away', async ({
  page,
}) => {
  await registerFreshUser(page)
  await page.request.post('/api/v1/reading', {
    headers: WEB,
    data: { kind: 'book', title: '设计心理学', author: 'Don Norman' },
  })
  await page.goto('/reading')

  const section = (name: string) => page.getByRole('region', { name })
  await expect(section('To read').getByText('设计心理学')).toBeVisible()

  await rowOf(page, '设计心理学').getByRole('button', { name: 'Start reading' }).click()
  await expect(section('Reading now').getByText('设计心理学')).toBeVisible()

  await rowOf(page, '设计心理学').getByRole('button', { name: 'Finished' }).click()
  // Gone from both open sections, and not gone from the app: the count is the way back, which is
  // the rule the task tree already keeps about finished work.
  await expect(section('Reading now')).toHaveCount(0)
  await expect(section('To read')).toHaveCount(0)
  const toggle = page.getByRole('button', { name: 'Finished 1' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(rowOf(page, '设计心理学')).toBeVisible()
})

test('the rail counts what is waiting, not the size of the pile', async ({ page }) => {
  await registerFreshUser(page)
  const add = (data: Record<string, unknown>) =>
    page.request.post('/api/v1/reading', { headers: WEB, data })
  await add({ kind: 'book', title: '要读的' })
  const done = await (await add({ kind: 'book', title: '读过的' })).json()
  await page.request.patch(`/api/v1/reading/${done.id}`, {
    headers: WEB,
    data: { status: 'done' },
  })

  // The count lives where every kind is listed, in the kind's own words.
  await page.goto('/things')
  await expect(page.locator('[data-kind="Reading"] [data-count]')).toHaveText('1 to read')
})

test('g l goes to Reading, in one keyspace with the task module', async ({ page }) => {
  await registerFreshUser(page)
  // No goto: a fresh navigation leaves focus where the document-level keys do not see it, and
  // this is about the chord, not about where focus lands after a page load.
  await expect(page).toHaveURL(/\/tasks\/today$/)
  await page.keyboard.press('g')
  await page.keyboard.press('l')
  await expect(page).toHaveURL(/\/reading$/)
  await expect(page.getByRole('heading', { name: 'Reading', level: 1 })).toBeVisible()
})

test('search reaches both modules from one box', async ({ page }) => {
  // The shell merges the providers; neither module knows the other is there. The dialog is named
  // “Search” and not “Search tasks” for the same reason.
  await registerFreshUser(page)
  const projects = await (await page.request.get('/api/v1/projects', { headers: WEB })).json()
  const inbox = projects.projects.find((p: { isInbox: boolean }) => p.isInbox)
  await page.request.post('/api/v1/tasks', {
    headers: WEB,
    data: { projectId: inbox.id, title: '配色重做', parentId: null },
  })
  await page.request.post('/api/v1/reading', {
    headers: WEB,
    data: { kind: 'book', title: '配色的书' },
  })
  await page.goto('/tasks/today')

  await page.getByRole('button', { name: 'Search' }).click()
  await page.getByRole('combobox', { name: 'Search' }).fill('配色')
  const dialog = page.getByRole('dialog', { name: 'Search' })
  await expect(dialog.getByRole('option').filter({ hasText: '配色重做' })).toHaveCount(1)
  await expect(dialog.getByRole('option').filter({ hasText: '配色的书' })).toHaveCount(1)
})

test('a project page carries both modules, each with its own block and numbers', async ({
  page,
}) => {
  await registerFreshUser(page)
  const project = await (
    await page.request.post('/api/v1/projects', { headers: WEB, data: { name: 'CTWS' } })
  ).json()
  await page.request.post('/api/v1/tasks', {
    headers: WEB,
    data: { projectId: project.id, title: '配色重做', parentId: null },
  })
  await page.request.post('/api/v1/reading', {
    headers: WEB,
    data: {
      kind: 'link',
      url: 'https://example.com/a',
      title: '一篇相关的文章',
      projectId: project.id,
    },
  })
  await page.goto(`/projects/${project.id}`)

  // The task module's block and the reading module's, side by side under one shell project.
  await expect(page.getByText('配色重做')).toBeVisible()
  await expect(page.getByText('一篇相关的文章')).toBeVisible()
  // And the reading module's number is its block's count, beside the tasks.
  await expect(
    page
      .getByRole('region', { name: 'Linked' })
      .getByRole('region', { name: 'Reading' })
      .locator('[data-count]'),
  ).toHaveText('1')
  // The row does NOT repeat the name of the project you are standing in -- the same rule the
  // dependency pane keeps, and the same reason the task tree shows no breadcrumb.
  await expect(page.getByRole('listitem').filter({ hasText: '一篇相关的文章' })).not.toContainText(
    'CTWS',
  )
})

test('a reading item is deleted from the bottom of its layer, after one question', async ({
  page,
}) => {
  await registerFreshUser(page)
  await page.request.post('/api/v1/reading', {
    headers: WEB,
    data: { kind: 'book', title: '设计心理学', author: 'Don Norman' },
  })
  await page.goto('/reading')
  const deletes: string[] = []
  page.on('request', (r) => r.method() === 'DELETE' && deletes.push(r.url()))

  // The row menu keeps only what can be done without opening the item.
  await rowOf(page, '设计心理学')
    .getByRole('button', { name: /More for/ })
    .click()
  await expect(page.getByRole('menuitem', { name: 'Rename' })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toHaveCount(0)
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: '设计心理学', exact: true }).click()
  const layer = page.getByRole('dialog', { name: 'Reading' })
  await expect(layer).toBeVisible()
  await expect(page).toHaveURL(new RegExp('/reading/[0-9a-f-]{36}$'))

  const remove = layer.getByRole('button', { name: 'Delete item' })
  // The last thing in the layer: Linked is above it.
  const [box, linked] = await Promise.all([
    remove.boundingBox(),
    layer.getByText('Linked', { exact: true }).boundingBox(),
  ])
  expect(box!.y).toBeGreaterThan(linked!.y)

  await remove.click()
  const ask = page.getByRole('alertdialog', { name: 'Confirm deleting this item' })
  await expect(ask).toContainText('Delete “设计心理学”?')
  expect(deletes).toHaveLength(0)
  await ask.getByRole('button', { name: 'Confirm delete' }).click()
  await expect(page.getByText('设计心理学')).toHaveCount(0)
  expect(deletes).toHaveLength(1)
})

test('a reading item is edited in its layer, not in a dropdown menu', async ({ page }) => {
  await registerFreshUser(page)
  await page.request.post('/api/v1/reading', {
    headers: WEB,
    data: { kind: 'link', url: 'https://www.linear.invalid/now/how-we-redesigned-issues' },
  })
  await page.goto('/reading')

  // The title is the link that opens the article in a new tab; the rest of the row opens the layer.
  await rowOf(page, 'linear.invalid/now/how-we-redesigned-issues')
    .getByText(/^Added/)
    .click()
  const layer = page.getByRole('dialog', { name: 'Reading' })
  await layer.getByRole('button', { name: 'Edit', exact: true }).click()
  await layer.getByLabel('Title').fill('Linear 怎么重做 issue')
  await layer.getByRole('button', { name: 'Save' }).click()

  await expect(layer.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
  await expect(page.getByText('Linear 怎么重做 issue').first()).toBeVisible()
})

test('a reading edit the server refuses stays open and says why', async ({ page }) => {
  await registerFreshUser(page)
  const made = await page.request.post('/api/v1/reading', {
    headers: WEB,
    data: { kind: 'book', title: 'Refused book' },
  })
  const id = ((await made.json()) as { id: string }).id
  await page.goto(`/reading/${id}`)
  const layer = page.getByRole('dialog', { name: 'Reading' })
  await layer.getByRole('button', { name: 'Edit', exact: true }).click()
  await layer.getByLabel('Title').fill('Refused again')
  await page.route(`**/api/v1/reading/${id}`, (r) =>
    r.request().method() === 'PATCH'
      ? r.fulfill({
          status: 400,
          contentType: 'application/problem+json',
          body: JSON.stringify({
            type: 'about:blank',
            title: 'Bad Request',
            status: 400,
            detail: 'That title is too long',
          }),
        })
      : r.continue(),
  )
  await layer.getByRole('button', { name: 'Save' }).click()
  await expect(layer.getByRole('alert')).toContainText('That title is too long')
  await expect(layer.getByLabel('Title')).toHaveValue('Refused again')
})

/**
 * A READING ROW IS THE APP'S ROW: the day you mean to finish it in the margin (a plan, so no flag),
 * its project's colour as the thread, then the kind, the title and a line naming the project. The
 * sections are headed where the threads hang, as the page's title is.
 */
test('the reading list hangs on the margin: the plan, the thread, then the item', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await registerFreshUser(page)
  const project = await page.request.post('/api/v1/projects', {
    headers: WEB,
    data: { name: 'CTWS' },
  })
  const projectId = ((await project.json()) as { id: string }).id
  const made = await page.request.post('/api/v1/reading', {
    headers: WEB,
    data: { kind: 'book', title: 'The Elements of Typographic Style', projectId },
  })
  expect(made.status(), await made.text()).toBe(201)
  const { id } = (await made.json()) as { id: string }
  // A fixed day years out, so the margin's word does not depend on today: its date.
  const planOn = '2030-05-28'
  const planned = await page.request.patch(`/api/v1/reading/${id}`, {
    headers: WEB,
    data: { planOn },
  })
  expect(planned.ok(), await planned.text()).toBe(true)
  await page.request.post('/api/v1/reading', {
    headers: WEB,
    data: { kind: 'book', title: 'Designing Data-Intensive Applications' },
  })
  await page.goto('/reading')

  const row = page.locator(`[data-reading-row="${id}"]`)
  await expect(row.locator('[data-row-lead-text]')).toHaveText('May 28')
  await expect(row.locator('[data-row-lead]')).toHaveAttribute('data-row-lead', 'plan')
  await expect(row.locator('[data-project-rail]')).toHaveAttribute('data-project-rail', projectId)
  await expect(row).toContainText('CTWS')

  // ONE x for the threads; the title and the section's heading hang on it.
  const threads = await page
    .locator('[data-reading-row] [data-thread]')
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().x)))
  expect(threads).toHaveLength(2)
  expect(new Set(threads).size).toBe(1)
  const h1 = (await page.getByRole('heading', { level: 1, name: 'Reading' }).boundingBox())!
  expect(Math.round(h1.x)).toBe(threads[0])
  const section = (await page.getByRole('heading', { level: 2, name: 'To read' }).boundingBox())!
  expect(Math.round(section.x)).toBe(threads[0])
})

test('the add box is empty for the next title once the server has the last', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/reading')
  const box = page.getByLabel('Add to the reading list')
  await box.waitFor()
  // The list read after the save is slow; the box must not wait for it.
  await slowReads(page, '**/api/v1/reading*')
  const posted = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/reading',
  )
  await box.fill('A first book')
  await box.press('Enter')
  await posted
  await box.pressSequentially('A second', { delay: 20 })
  await expect(box).toHaveValue('A second')
})
