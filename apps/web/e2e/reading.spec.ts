import { expect, test, type Page } from '@playwright/test'
import { registerFreshUser, WEB } from './helpers'

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

  const toReading = await captureLine(page, 'https://linear.app/now/redesign')
  expect(new URL(toReading.url()).pathname).toBe('/api/v1/reading')
  await expect(page.getByText('Added to')).toContainText('Reading')

  const toInbox = await captureLine(page, '看看这篇 https://linear.app/now/redesign')
  expect(new URL(toInbox.url()).pathname).toBe('/api/v1/tasks')
  await expect(page.getByText('Added to')).toContainText('Inbox')
})

test('an untitled link is listed by host and path, and can be given a name', async ({ page }) => {
  await registerFreshUser(page)
  await page.request.post('/api/v1/reading', {
    headers: WEB,
    data: { kind: 'link', url: 'https://www.linear.app/now/how-we-redesigned-issues' },
  })
  await page.goto('/reading')

  // A pasted link shows its HOST AND PATH -- the host alone ("x.com", "github.com") does not
  // say which tweet or which repo, so a row of it carries no information at all.
  const row = rowOf(page, 'linear.app/now/how-we-redesigned-issues')
  await expect(row.getByRole('link')).toHaveText('linear.app/now/how-we-redesigned-issues')
  // And the line under it does not repeat what the line above already says.
  await expect(row.getByText('linear.app', { exact: true })).toHaveCount(0)
  await expect(row.getByRole('link')).toHaveAttribute(
    'href',
    'https://www.linear.app/now/how-we-redesigned-issues',
  )
  // And it opens away from the workspace, so a half-read list is not lost.
  await expect(row.getByRole('link')).toHaveAttribute('target', '_blank')

  await row.getByRole('button', { name: /More for/ }).click()
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  // FOCUS IS IN THE FIELD, not back on the menu's trigger: a menu restores focus to its trigger
  // when it closes, which would leave an editor nobody can type into without clicking it first.
  await expect(page.getByRole('textbox', { name: 'Title' })).toBeFocused()
  await page.getByRole('textbox', { name: 'Title' }).fill('Linear 怎么重做 issue')
  // On the KEYBOARD, not through the locator: re-resolving it would blur the field, and blurring
  // is how this row cancels a rename.
  await page.keyboard.press('Enter')
  await expect(rowOf(page, 'Linear 怎么重做 issue')).toBeVisible()
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
  await expect(section('Reading').getByText('设计心理学')).toBeVisible()

  await rowOf(page, '设计心理学').getByRole('button', { name: 'Start reading' }).click()
  await expect(section('Reading now').getByText('设计心理学')).toBeVisible()

  await rowOf(page, '设计心理学').getByRole('button', { name: 'Finished' }).click()
  // Gone from both open sections, and not gone from the app: the count is the way back, which is
  // the rule the task tree already keeps about finished work.
  await expect(section('Reading now')).toHaveCount(0)
  await expect(section('Reading')).toHaveCount(0)
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

  await page.goto('/reading')
  const rail = page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: /Reading/ })
  await expect(rail.locator('[data-count]')).toHaveText('1')
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
  // And the reading module's number in the banner the shell owns.
  await expect(page.getByRole('region', { name: 'Project at a glance' })).toContainText('Reading')
  // The row does NOT repeat the name of the project you are standing in -- the same rule the
  // dependency pane keeps, and the same reason the task tree shows no breadcrumb.
  await expect(page.getByRole('listitem').filter({ hasText: '一篇相关的文章' })).not.toContainText(
    'CTWS',
  )
})

test('deleting a reading item asks first, in the row, in the danger colour', async ({ page }) => {
  // An item has no page of its own to put a danger zone at the foot of, so its menu carries the
  // two rules the zone would: the colour, and the question.
  await registerFreshUser(page)
  await page.request.post('/api/v1/reading', {
    headers: WEB,
    data: { kind: 'book', title: '设计心理学', author: 'Don Norman' },
  })
  await page.goto('/reading')
  const deletes: string[] = []
  page.on('request', (r) => r.method() === 'DELETE' && deletes.push(r.url()))

  const row = rowOf(page, '设计心理学')
  await row.getByRole('button', { name: /More for/ }).click()
  const item = page.getByRole('menuitem', { name: 'Delete' })
  const colour = await item.evaluate((el) => getComputedStyle(el).color)
  const plain = await page
    .getByRole('menuitem', { name: 'Rename' })
    .evaluate((el) => getComputedStyle(el).color)
  expect(colour).not.toBe(plain)
  await item.click()

  // The question stands where the row stood, so it is read where the hand already is.
  const ask = page.getByRole('alertdialog', { name: 'Confirm deleting this item' })
  await expect(ask).toContainText('Delete “设计心理学”?')
  expect(deletes).toHaveLength(0)
  await ask.getByRole('button', { name: 'Cancel' }).click()
  await expect(row.getByRole('button', { name: /More for/ })).toBeVisible()

  await row.getByRole('button', { name: /More for/ }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Confirm delete' }).click()
  await expect(page.getByText('设计心理学')).toHaveCount(0)
  expect(deletes).toHaveLength(1)
})
