import { expect, test, type Page } from '@playwright/test'
import {
  apiPost,
  captureBox,
  holdFirstRead,
  makeProject,
  makeReading,
  makeTask,
  openCapture,
  patchAnswered,
  registerFreshUser,
  slowReads,
  WEB,
} from './helpers'

/**
 * THE READING LIST -- THE SECOND MODULE, through the browser.
 *
 * What is under test here is mostly not the list: it is the SEAM. A second module contributed a
 * rail row, a chord, a search provider, a project block and a capture rule, and the shell was not
 * edited to make room for any of them. The capture rule is the one that could not exist before --
 * with one module there was nothing to route to.
 */

const capture = (page: Page) => captureBox(page)
/** The overview's To read block (FR-072). */
const toRead = (page: Page) => page.getByRole('main').getByRole('region', { name: 'To read' })
/** One part of the Reading sidebar's list: Reading, To read, Finished or Dropped. */
const sidebarPart = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Reading' }).getByRole('region', { name })
/**
 * Picks a status on an item's page, which saves it there and then (FR-073), and waits for the
 * server's answer and the picker saying the new one.
 */
async function setStatus(page: Page, label: string) {
  const main = page.getByRole('main')
  await main.getByRole('button', { name: /^Status: / }).click()
  await page.getByRole('menuitem', { name: new RegExp(`^${label}`) }).click()
  await expect(main.getByRole('button', { name: `Status: ${label}` })).toBeEnabled()
}

async function captureLine(page: Page, line: string) {
  const posted = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      /\/api\/v1\/(tasks|reading)$/.test(new URL(r.url()).pathname),
  )
  await openCapture(page)
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
  await expect(page.getByText('Added to')).toContainText('To read')

  const toInbox = await captureLine(page, '看看这篇 https://linear.invalid/now/redesign')
  expect(new URL(toInbox.url()).pathname).toBe('/api/v1/tasks')
  await expect(page.getByText('Added to')).toContainText('Inbox')
})

/**
 * Added while the overview's first read is still out: it is on the overview when that read lands.
 * The refetch after the write must not be handed the read that left before it.
 */
test('a link added while the overview is still loading is on it', async ({ page }) => {
  await registerFreshUser(page, '/')
  const release = await holdFirstRead(page, '**/api/v1/reading')
  await page.goto('/reading')
  const made = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/api\/v1\/reading$/.test(r.url()),
  )
  await page.getByRole('button', { name: 'Add reading' }).click()
  await capture(page).fill('https://typography.invalid/elements')
  await capture(page).press('Enter')
  await made
  release()
  await expect(
    toRead(page).getByRole('link', { name: /^elements\s*typography\.invalid/ }),
  ).toBeVisible()
})

test('an untitled link is named by its path beside its site, and by host and path on its page', async ({
  page,
}) => {
  await registerFreshUser(page)
  const item = await apiPost(page, '/reading', {
    kind: 'link',
    url: 'https://www.linear.invalid/now/how-we-redesigned-issues',
  })
  await page.goto('/reading')

  // In a row its site is said once, on the right; its name is the path, which says which page
  // (R-02). The host alone ("x.com", "github.com") would not say which tweet or which repo.
  const row = page.locator(`[data-to-read="${item.id}"]`)
  await expect(row.locator('span').nth(0)).toHaveText('now/how-we-redesigned-issues')
  await expect(row.locator('span').nth(1)).toHaveText('linear.invalid')
  await row.click()
  await expect(page).toHaveURL(new RegExp(`/reading/${item.id}$`))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'linear.invalid/now/how-we-redesigned-issues',
  )
  const open = page.getByRole('main').getByRole('link', { name: 'Open link' })
  await expect(open).toHaveAttribute(
    'href',
    'https://www.linear.invalid/now/how-we-redesigned-issues',
  )
  // And it opens away from the workspace, so a half-read list is not lost.
  await expect(open).toHaveAttribute('target', '_blank')
})

test('a book moves to read → reading → finished, and the finished pile is one link away', async ({
  page,
}) => {
  await registerFreshUser(page)
  const id = await makeReading(
    page,
    { kind: 'book', title: '设计心理学' },
    { author: 'Don Norman' },
  )
  await page.goto('/reading')
  await expect(toRead(page)).toContainText('设计心理学')
  await expect(page.locator('[data-reading-card]')).toHaveCount(0)

  await page.locator(`[data-to-read="${id}"]`).click()
  await setStatus(page, 'Reading')
  await page.goto('/reading')
  await expect(page.locator(`[data-reading-card="${id}"]`)).toContainText('设计心理学')
  await expect(toRead(page)).not.toContainText('设计心理学')

  await page.locator(`[data-reading-card="${id}"]`).click()
  await setStatus(page, 'Finished')
  await page.goto('/reading')
  // Gone from both open parts, and not gone from the app: the count is the way back, which is
  // the rule the task tree already keeps about finished work.
  await expect(page.locator('[data-reading-card]')).toHaveCount(0)
  await expect(toRead(page)).not.toContainText('设计心理学')
  await page.getByRole('main').getByRole('link', { name: '1 finished' }).click()
  await expect(sidebarPart(page, 'Finished')).toContainText('设计心理学')
})

test('search reaches both modules from one box', async ({ page }) => {
  // The shell merges the providers; neither module knows the other is there. The dialog is named
  // “Search” and not “Search tasks” for the same reason.
  await registerFreshUser(page)
  const projects = await (await page.request.get('/api/v1/projects', { headers: WEB })).json()
  const inbox = projects.projects.find((p: { isInbox: boolean }) => p.isInbox)
  await apiPost(page, '/tasks', { projectId: inbox.id, title: '配色重做', parentId: null })
  await apiPost(page, '/reading', { kind: 'book', title: '配色的书' })
  await page.goto('/today')

  await page.getByRole('button', { name: /^Search everything/ }).click()
  await page.getByRole('combobox', { name: 'Search' }).fill('配色')
  const dialog = page.getByRole('dialog', { name: 'Search' })
  await expect(dialog.getByRole('option').filter({ hasText: '配色重做' })).toHaveCount(1)
  await expect(dialog.getByRole('option').filter({ hasText: '配色的书' })).toHaveCount(1)
})

test('a project page carries both modules, each with its own block and numbers', async ({
  page,
}) => {
  await registerFreshUser(page)
  const projectId = await makeProject(page, 'CTWS')
  await makeTask(page, projectId, '配色重做')
  await makeReading(
    page,
    { kind: 'link', url: 'https://example.com/a' },
    { title: '一篇相关的文章', projectId },
  )
  await page.goto(`/projects/${projectId}`)

  // The task module's tree and the reading module's block, on one shell project (FR-055).
  await expect(page.getByRole('main').getByText('配色重做')).toBeVisible()
  await expect(page.getByText('一篇相关的文章')).toBeVisible()
  // And the reading module's number is its block's count, beside the tasks.
  await expect(page.getByRole('region', { name: 'Reading' }).locator('[data-count]')).toHaveText(
    '1',
  )
  // The row does NOT repeat the name of the project you are standing in -- the same rule the
  // dependency pane keeps, and the same reason the task tree shows no breadcrumb.
  await expect(page.getByRole('listitem').filter({ hasText: '一篇相关的文章' })).not.toContainText(
    'CTWS',
  )
})

test('a reading item is deleted from the foot of its edit page, after one question', async ({
  page,
}) => {
  await registerFreshUser(page)
  const id = await makeReading(
    page,
    { kind: 'book', title: '设计心理学' },
    { author: 'Don Norman' },
  )
  await page.goto(`/reading/${id}`)
  const deletes: string[] = []
  page.on('request', (r) => r.method() === 'DELETE' && deletes.push(r.url()))

  await page.getByRole('main').getByRole('link', { name: 'Edit', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/reading/${id}/edit$`))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Edit 设计心理学')

  const remove = page.getByRole('button', { name: 'Delete 设计心理学' })
  // The last thing on the page: the form, and its Save, are above it.
  const [box, save] = await Promise.all([
    remove.boundingBox(),
    page.getByRole('button', { name: /^Save/ }).boundingBox(),
  ])
  expect(box!.y).toBeGreaterThan(save!.y)

  await remove.click()
  const ask = page.getByRole('alertdialog', { name: 'Confirm deleting this item' })
  await expect(ask).toContainText(
    'Delete 设计心理学? It goes from your reading. Notes about it, and the people, tasks and projects it is linked to, stay.',
  )
  expect(deletes).toHaveLength(0)
  await ask.getByRole('button', { name: /^Delete/ }).click()
  await expect(page).toHaveURL(/\/reading$/)
  await expect(page.getByText('设计心理学')).toHaveCount(0)
  expect(deletes).toHaveLength(1)
})

test('a reading item is edited on its edit page and its page says the new title', async ({
  page,
}) => {
  await registerFreshUser(page)
  const item = await apiPost(page, '/reading', {
    kind: 'link',
    url: 'https://www.linear.invalid/now/how-we-redesigned-issues',
  })
  await page.goto(`/reading/${item.id}`)

  await page.getByRole('main').getByRole('link', { name: 'Edit', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill('Linear 怎么重做 issue')
  await page.getByRole('button', { name: /^Save/ }).click()

  await expect(page).toHaveURL(new RegExp(`/reading/${item.id}$`))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Linear 怎么重做 issue')
})

test('a reading edit the server refuses stays open and says why', async ({ page }) => {
  await registerFreshUser(page)
  const made = await apiPost(page, '/reading', { kind: 'book', title: 'Refused book' })
  const id = made.id
  await page.goto(`/reading/${id}/edit`)
  await page.getByLabel('Title', { exact: true }).fill('Refused again')
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
  await page.getByRole('button', { name: /^Save/ }).click()
  const form = page.getByRole('form', { name: 'Edit reading item' })
  await expect(form.getByRole('alert')).toContainText('That title is too long')
  await expect(page).toHaveURL(new RegExp(`/reading/${id}/edit$`))
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Refused again')
})

/**
 * Added from a person's page, the overview has its own add line saying whose recommendation it
 * is. It is empty for the next title as soon as the server has the last, not when the list is
 * read again.
 */
test('the add box is empty for the next title once the server has the last', async ({ page }) => {
  await registerFreshUser(page)
  const person = await apiPost(page, '/people', { name: 'Ying Chen' })
  await page.goto(`/reading?${new URLSearchParams({ recommendedBy: person.id, by: 'Ying Chen' })}`)
  const box = page.getByLabel('Add to the reading list')
  await box.waitFor()
  await expect(page.getByRole('main')).toContainText('Recommended by Ying Chen')
  // The list read after the save is slow; the box must not wait for it.
  await slowReads(page, '**/api/v1/reading*')
  // Theirs: made, then marked as recommended by them; the server has it once both are answered.
  const marked = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && /\/api\/v1\/reading\/[^/]+$/.test(r.url()),
  )
  await box.fill('A first book')
  await box.press('Enter')
  await marked
  await box.pressSequentially('A second', { delay: 20 })
  await expect(box).toHaveValue('A second')
  // And what was added is theirs.
  await expect(page.locator('[data-to-read]').filter({ hasText: 'A first book' })).toContainText(
    'A first book',
  )
  const items = await (await page.request.get('/api/v1/reading', { headers: WEB })).json()
  const first = (
    items.reading as { title: string | null; recommendedBy: { name: string } | null }[]
  ).find((i) => i.title === 'A first book')
  expect(first?.recommendedBy?.name).toBe('Ying Chen')
})

// ------------------------------------------------------------------ the overview (FR-072)

test('the overview has a card for each item being read: who recommended it or its project', async ({
  page,
}) => {
  await registerFreshUser(page)
  const person = await apiPost(page, '/people', { name: 'Ying Chen' })
  const projectId = await makeProject(page, 'CTWS')
  const fromYing = await makeReading(
    page,
    { kind: 'book', title: 'Thinking in Systems' },
    { author: 'Donella Meadows', status: 'reading', recommendedById: person.id },
  )
  const forCtws = await makeReading(
    page,
    { kind: 'link', url: 'https://www.linear.invalid/now/how-we-redesigned-issues' },
    { status: 'reading', projectId },
  )
  await makeReading(page, { kind: 'book', title: 'Waiting book' })
  await page.goto('/reading')

  await expect(page.getByRole('heading', { level: 1, name: 'Reading' })).toBeVisible()
  await expect(page.locator('[data-reading-card]')).toHaveCount(2)
  const ying = page.locator(`[data-reading-card="${fromYing}"]`)
  await expect(ying).toContainText('Thinking in Systems')
  await expect(ying).toContainText('Donella Meadows')
  await expect(ying).toContainText('Reading')
  await expect(ying).toContainText('Recommended by Ying Chen')
  const ctws = page.locator(`[data-reading-card="${forCtws}"]`)
  // Its path for a name, its site under it once (R-02).
  await expect(ctws).toContainText('now/how-we-redesigned-issues')
  await expect(ctws).toContainText('linear.invalid')
  await expect(ctws).toContainText('In CTWS')
  // What is waiting is not a card; it is a row under To read.
  await expect(toRead(page)).toContainText('Waiting book')
  // A card is the way to its page.
  await ying.click()
  await expect(page).toHaveURL(new RegExp(`/reading/${fromYing}$`))
})

test('To read has the latest added first, five of them, then All N', async ({ page }) => {
  await registerFreshUser(page)
  const titles = ['Book 1', 'Book 2', 'Book 3', 'Book 4', 'Book 5', 'Book 6', 'Book 7']
  // One after another, so each is added after the last.
  for (const title of titles) await makeReading(page, { kind: 'book', title })
  await page.goto('/reading')

  const rows = page.locator('[data-to-read]')
  await expect(rows).toHaveText([/Book 7/, /Book 6/, /Book 5/, /Book 4/, /Book 3/])
  await expect(toRead(page)).toContainText('7')
  await page.getByRole('button', { name: 'All 7' }).click()
  await expect(rows).toHaveText([...titles].reverse().map((t) => new RegExp(t)))
  await expect(page.getByRole('button', { name: /^All / })).toHaveCount(0)
})

test('N finished opens the sidebar on what is finished, with what was dropped apart', async ({
  page,
}) => {
  await registerFreshUser(page)
  await makeReading(page, { kind: 'book', title: 'Finished book' }, { status: 'done' })
  await makeReading(page, { kind: 'book', title: 'Dropped book' }, { status: 'dropped' })
  await makeReading(page, { kind: 'book', title: 'Waiting book' })
  await page.goto('/reading')
  await expect(sidebarPart(page, 'To read')).toContainText('Waiting book')

  // What was dropped is not finished (BUG-055).
  await page.getByRole('main').getByRole('link', { name: '1 finished' }).click()
  await expect(page).toHaveURL(/\/reading\?list=finished$/)
  await expect(sidebarPart(page, 'Finished')).toContainText('Finished book')
  await expect(sidebarPart(page, 'Finished')).not.toContainText('Dropped book')
  await expect(sidebarPart(page, 'Dropped')).toContainText('Dropped book')
  await expect(sidebarPart(page, 'To read')).toHaveCount(0)
  // And the way back to what is being read.
  await page.getByRole('link', { name: 'Back to what is being read' }).click()
  await expect(page).toHaveURL(/\/reading$/)
  await expect(sidebarPart(page, 'To read')).toContainText('Waiting book')
})

test('Add reading opens the capture box on Reading', async ({ page }) => {
  await registerFreshUser(page)
  await makeReading(page, { kind: 'book', title: 'Something already there' })
  await page.goto('/reading')
  await page.getByRole('button', { name: 'Add reading' }).click()
  await expect(capture(page)).toBeFocused()
  await expect(page.getByRole('radio', { name: 'Reading' })).toHaveAttribute('aria-checked', 'true')
  // A link pasted there is on the list.
  await capture(page).fill('https://typography.invalid/elements')
  await capture(page).press('Enter')
  await expect(
    toRead(page).getByRole('link', { name: /^elements\s*typography\.invalid/ }),
  ).toBeVisible()
})

test('a book title typed in the capture box on Reading is a book to read', async ({ page }) => {
  // "Add reading" is the overview's only way to add (FR-072), and a book has no link to paste.
  await registerFreshUser(page)
  await makeReading(page, { kind: 'book', title: 'Something already there' })
  await page.goto('/reading')
  await page.getByRole('button', { name: 'Add reading' }).click()
  const posted = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/reading',
  )
  await capture(page).fill('The Elements of Typographic Style')
  await capture(page).press('Enter')
  const answer = await posted
  expect(answer.ok(), `the book is accepted: ${await answer.text()}`).toBe(true)
  await expect(toRead(page)).toContainText('The Elements of Typographic Style')
})

test('an empty Reading is the module empty state, whose button opens the capture box', async ({
  page,
}) => {
  await registerFreshUser(page, '/reading')
  await expect(page.getByRole('heading', { level: 2, name: 'No reading yet' })).toBeVisible()
  await page.getByRole('main').getByRole('button', { name: /^New / }).click()
  await expect(capture(page)).toBeFocused()
  await expect(page.getByRole('radio', { name: 'Reading' })).toHaveAttribute('aria-checked', 'true')
})

// ------------------------------------------------------------------ an item's page (FR-073)

test('a reading item’s page says its status, who recommended it and its project; Open link is for a link', async ({
  page,
}) => {
  await registerFreshUser(page)
  const person = await apiPost(page, '/people', { name: 'Ying Chen' })
  const projectId = await makeProject(page, 'CTWS')
  const link = await makeReading(
    page,
    { kind: 'link', url: 'https://martinfowler.invalid/articles/refactoring' },
    {
      title: 'Refactoring notes',
      status: 'reading',
      recommendedById: person.id,
      projectId,
      // A day years out, so its words do not depend on today: its date with its year.
      planOn: '2030-05-28',
    },
  )
  await page.goto(`/reading/${link}`)
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { level: 1 })).toHaveText('Refactoring notes')
  await expect(main).toContainText('martinfowler.invalid')
  await expect(main.getByRole('button', { name: 'Status: Reading' })).toBeVisible()
  await expect(main.getByRole('link', { name: 'Open link' })).toHaveAttribute(
    'href',
    'https://martinfowler.invalid/articles/refactoring',
  )
  const profile = page.getByRole('complementary', { name: 'Profile' })
  await expect(profile.getByRole('region', { name: 'About' })).toContainText('Finish by')
  await expect(profile.getByRole('region', { name: 'About' })).toContainText('May 28, 2030')
  await expect(profile.getByRole('region', { name: 'About' })).toContainText('Started')
  const recommended = profile.getByRole('region', { name: 'Recommended by' })
  await expect(recommended.getByRole('link', { name: 'Ying Chen' })).toHaveAttribute(
    'href',
    `/people/${person.id}`,
  )
  const inProject = profile.getByRole('region', { name: 'In project' })
  await expect(inProject.getByRole('link', { name: /CTWS/ })).toHaveAttribute(
    'href',
    `/projects/${projectId}`,
  )

  // A book has nowhere to open: no Open link, and its author where a link has its address.
  const book = await makeReading(
    page,
    { kind: 'book', title: 'Thinking in Systems' },
    { author: 'Donella Meadows' },
  )
  await page.goto(`/reading/${book}`)
  await expect(main.getByRole('heading', { level: 1 })).toHaveText('Thinking in Systems')
  await expect(main.getByRole('button', { name: 'Status: To read' })).toBeVisible()
  await expect(main.getByRole('link', { name: 'Open link' })).toHaveCount(0)
  await expect(profile.getByRole('region', { name: 'About' })).toContainText('Donella Meadows')
  await expect(profile.getByRole('region', { name: 'Recommended by' })).toHaveCount(0)
  await expect(profile.getByRole('region', { name: 'In project' })).toHaveCount(0)
})

test('starting a book from its page puts Started reading on its timeline', async ({ page }) => {
  await registerFreshUser(page)
  const id = await makeReading(page, { kind: 'book', title: 'Thinking in Systems' })
  await page.goto(`/reading/${id}`)
  const timeline = page.getByRole('region', { name: 'Timeline' })
  await expect(timeline).toContainText('Added')
  await expect(timeline).not.toContainText('Started reading')

  const patched = patchAnswered(page, `reading/${id}`)
  await setStatus(page, 'Reading')
  expect((await patched).ok()).toBe(true)
  await expect(timeline).toContainText('Started reading')
})

test('who recommended it is picked on the edit page, shown with their face, and cleared', async ({
  page,
}) => {
  await registerFreshUser(page)
  const mira = await apiPost(page, '/people', { givenName: 'Mira', familyName: 'Chen' })
  const id = await makeReading(page, { kind: 'book', title: 'Thinking in Systems' })
  await page.goto(`/reading/${id}/edit`)

  // People only, one of them (FR-073).
  await page.getByRole('button', { name: 'Recommended by: Nobody' }).click()
  const picker = page.getByRole('dialog')
  await picker.getByRole('combobox').fill('Mira')
  await picker.getByRole('option', { name: /Mira Chen/ }).click()
  await expect(page.getByRole('button', { name: 'Recommended by: Mira Chen' })).toBeVisible()
  await page.getByRole('button', { name: /^Save/ }).click()
  await expect(page).toHaveURL(new RegExp(`/reading/${id}$`))

  // On its page: an avatar and a name, the way to the person (R-03); the timeline says so.
  const by = page.locator(`[data-recommended-by="${mira.id}"]`)
  await expect(by).toHaveText('MCMira Chen')
  await expect(page.locator('[data-timeline-entry="change"]').first()).toContainText(
    'Recommended by Mira Chen',
  )

  await page.getByRole('main').getByRole('link', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Clear who recommended it' }).click()
  await page.getByRole('button', { name: /^Save/ }).click()
  await expect(page).toHaveURL(new RegExp(`/reading/${id}$`))
  await expect(by).toHaveCount(0)
  await expect(page.locator('[data-timeline-entry="change"]').first()).toContainText(
    'No longer recommended by Mira Chen',
  )
})
