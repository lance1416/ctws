import { expect, test, type Page } from '@playwright/test'
import {
  makeProject,
  openProject,
  registerFreshUser,
  serverParents,
  slowReads,
  submitCreate,
  WEB,
} from './helpers'

const POST_TASK = /\/api\/v1\/tasks$/

const handle = (page: Page, title: string) =>
  page.getByRole('button', { name: `Task: ${title}`, exact: true })
const row = (page: Page, title: string) =>
  page.getByRole('listitem').filter({ has: handle(page, title) })
const newInput = (page: Page) => page.getByPlaceholder('Enter to add, Esc to cancel')

/** Counts task creations the page sends, so a test can assert that none was. */
function recordCreates(page: Page) {
  const posts: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && POST_TASK.test(new URL(r.url()).pathname)) posts.push(r.url())
  })
  return posts
}

/** Resolves once a task creation has been answered successfully. */
const createdOk = (page: Page) =>
  page.waitForResponse(
    (r) => r.request().method() === 'POST' && POST_TASK.test(new URL(r.url()).pathname) && r.ok(),
  )

/** Visible rows, top to bottom, as "depth:title". The open input is not a row. */
async function shape(page: Page) {
  const l = await page
    .locator('li[data-depth]:not([data-new-task])')
    .evaluateAll((els) =>
      els.map((el) => `${el.getAttribute('data-depth')}:${el.querySelector('button')!.ariaLabel}`),
    )
  return l.map((s) => s.replace('Task: ', ''))
}

/** A project holding A (children a1, a2) and a root B. Returns its id. */
async function seed(page: Page): Promise<string> {
  await registerFreshUser(page)
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Projects' })
    .click()
  await submitCreate(page, 'New project', 'P')
  await openProject(page, 'P', true)
  const projectId = page.url().split('/').pop()!
  const ids = new Map<string, string>()
  for (const [title, parent] of [
    ['A', null],
    ['a1', 'A'],
    ['a2', 'A'],
    ['B', null],
  ] as const) {
    const res = await page.request.post('/api/v1/tasks', {
      headers: WEB,
      data: { projectId, title, parentId: parent ? ids.get(parent)! : null },
    })
    expect(res.status()).toBe(201)
    ids.set(title, ((await res.json()) as { id: string }).id)
  }
  await page.goto(page.url())
  await expect(page.getByRole('listitem')).toHaveCount(4)
  return projectId
}

/** The element right after a2's row must be the open input: it sits where the task will land. */
const inputFollows = (page: Page, title: string) =>
  expect(row(page, title).locator('xpath=following-sibling::li[1]')).toHaveAttribute(
    'data-new-task',
    'true',
  )

test('Shift+Enter adds a sibling at the end of the rows own level', async ({ page }) => {
  const projectId = await seed(page)
  // Focused on a1, which is NOT the last child: the new task must still land after a2.
  await handle(page, 'a1').focus()
  await page.keyboard.press('Shift+Enter')
  await expect(newInput(page)).toBeFocused()
  await inputFollows(page, 'a2')
  const created = createdOk(page)
  await page.keyboard.type('a3')
  await page.keyboard.press('Enter')
  await created
  await expect(row(page, 'a3')).toBeVisible()
  expect(await shape(page)).toEqual(['1:A', '2:a1', '2:a2', '2:a3', '1:B'])
  expect((await serverParents(page, projectId)).a3).toBe('A')
})

test('Shift+Enter on a root row adds a root task at the end of the list', async ({ page }) => {
  const projectId = await seed(page)
  await handle(page, 'A').focus()
  await page.keyboard.press('Shift+Enter')
  const created = createdOk(page)
  await page.keyboard.type('C')
  await page.keyboard.press('Enter')
  await created
  await expect(row(page, 'C')).toBeVisible()
  expect(await shape(page)).toEqual(['1:A', '2:a1', '2:a2', '1:B', '1:C'])
  expect((await serverParents(page, projectId)).C).toBeNull()
})

test('Alt+Enter adds a child at the end of the rows children', async ({ page }) => {
  const projectId = await seed(page)
  await handle(page, 'A').focus()
  await page.keyboard.press('Alt+Enter')
  await expect(newInput(page)).toBeFocused()
  // The input sits after a2 (A's last child), not directly under A.
  await inputFollows(page, 'a2')
  const created = createdOk(page)
  await page.keyboard.type('a3')
  await page.keyboard.press('Enter')
  await created
  await expect(row(page, 'a3')).toBeVisible()
  expect(await shape(page)).toEqual(['1:A', '2:a1', '2:a2', '2:a3', '1:B'])
  expect((await serverParents(page, projectId)).a3).toBe('A')
})

test('Alt+Enter on a leaf makes it a parent', async ({ page }) => {
  const projectId = await seed(page)
  await handle(page, 'B').focus()
  await page.keyboard.press('Alt+Enter')
  const created = createdOk(page)
  await page.keyboard.type('b1')
  await page.keyboard.press('Enter')
  await created
  await expect(row(page, 'b1')).toBeVisible()
  expect(await shape(page)).toEqual(['1:A', '2:a1', '2:a2', '1:B', '2:b1'])
  expect((await serverParents(page, projectId)).b1).toBe('B')
})

test('the + button adds a child under its own row', async ({ page }) => {
  const projectId = await seed(page)
  await row(page, 'B').hover()
  await row(page, 'B').getByRole('button', { name: 'Add a subtask to “B”' }).click()
  await expect(newInput(page)).toBeFocused()
  const created = createdOk(page)
  await page.keyboard.type('b1')
  await page.keyboard.press('Enter')
  await created
  await expect(row(page, 'b1')).toBeVisible()
  expect(await shape(page)).toEqual(['1:A', '2:a1', '2:a2', '1:B', '2:b1'])
  expect((await serverParents(page, projectId)).b1).toBe('B')
  // The click did not fall through to the row and open the detail panel.
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('adding a child to a collapsed row expands it first', async ({ page }) => {
  const projectId = await seed(page)
  await row(page, 'A').getByRole('button', { name: 'Collapse' }).click()
  await expect(row(page, 'a1')).toHaveCount(0)

  await handle(page, 'A').focus()
  await page.keyboard.press('Alt+Enter')
  // Expanded so the input is visible, and the existing children are back with it.
  await expect(newInput(page)).toBeVisible()
  await expect(row(page, 'a1')).toBeVisible()
  await expect(row(page, 'A').getByRole('button', { name: 'Collapse' })).toBeVisible()

  const created = createdOk(page)
  await page.keyboard.type('a3')
  await page.keyboard.press('Enter')
  await created
  await expect(row(page, 'a3')).toBeVisible()
  expect(await shape(page)).toEqual(['1:A', '2:a1', '2:a2', '2:a3', '1:B'])
  expect((await serverParents(page, projectId)).a3).toBe('A')
})

test('Enter commits and reopens the input, so tasks can be added in a row', async ({ page }) => {
  const projectId = await seed(page)
  await handle(page, 'B').focus()
  await page.keyboard.press('Alt+Enter')

  let created = createdOk(page)
  await page.keyboard.type('first')
  await page.keyboard.press('Enter')
  await created
  await expect(row(page, 'first')).toBeVisible()
  // Still open, empty and focused: no mouse, no second shortcut.
  await expect(newInput(page)).toBeFocused()
  await expect(newInput(page)).toHaveValue('')

  created = createdOk(page)
  await page.keyboard.type('second')
  await page.keyboard.press('Enter')
  await created
  await expect(row(page, 'second')).toBeVisible()
  await expect(newInput(page)).toBeFocused()

  // Both at the same level under B, in the order typed.
  expect(await shape(page)).toEqual(['1:A', '2:a1', '2:a2', '1:B', '2:first', '2:second'])
  const parents = await serverParents(page, projectId)
  expect([parents.first, parents.second]).toEqual(['B', 'B'])
})

test('five tasks typed one after another all land, in order', async ({ page }) => {
  // The next title is typed the moment the last row shows: an input that stayed busy for longer
  // than its own list takes to refetch would swallow it. Every other read is held until the run is
  // over, so an input waiting on any of them never frees.
  await seed(page)
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const ownList = /\/api\/v1\/tasks\?projectId=/.test(request.url())
    if (request.method() === 'GET' && !ownList) await held
    await route.continue()
  })
  await handle(page, 'B').focus()
  await page.keyboard.press('Alt+Enter')
  const titles = ['one', 'two', 'three', 'four', 'five']
  for (const title of titles) {
    const created = createdOk(page)
    await page.keyboard.type(title)
    await page.keyboard.press('Enter')
    await created
    await expect(row(page, title)).toBeVisible()
  }
  release()
  for (const title of titles) await expect(row(page, title)).toBeVisible()
  expect(await shape(page)).toEqual(['1:A', '2:a1', '2:a2', '1:B', ...titles.map((t) => `2:${t}`)])
})

/*
  The box is empty again only when its create is answered: an empty box says "type the next one",
  and an Enter in it while the last create is still out is dropped. A box emptied when the new row
  lands -- before the create's own answer -- would swallow the second task of a quick run.
*/
test('the box stays as typed until its create is answered, even if the row lands first', async ({
  page,
}) => {
  await seed(page)
  await handle(page, 'B').focus()
  await page.keyboard.press('Alt+Enter')

  // The create reaches the server; its answer is held.
  let reached = () => {}
  const atServer = new Promise<void>((resolve) => (reached = resolve))
  let release = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route(POST_TASK, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const response = await route.fetch()
    reached()
    await held
    await route.fulfill({ response })
  })
  await page.keyboard.type('first')
  await page.keyboard.press('Enter')
  await atServer

  // Meanwhile the list refetches for its own reasons (here: coming back to the tab).
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(row(page, 'first')).toBeVisible()
  await expect(newInput(page)).toHaveValue('first')

  const created = createdOk(page)
  release()
  await created
  await expect(newInput(page)).toHaveValue('')
  await expect(newInput(page)).toBeFocused()

  const second = createdOk(page)
  await page.keyboard.type('second')
  await page.keyboard.press('Enter')
  await second
  await expect(row(page, 'second')).toBeVisible()
  expect(await shape(page)).toEqual(['1:A', '2:a1', '2:a2', '1:B', '2:first', '2:second'])
})

test('Escape cancels without creating, and focus returns to the row', async ({ page }) => {
  const projectId = await seed(page)
  const posts = recordCreates(page)
  await handle(page, 'B').focus()
  await page.keyboard.press('Alt+Enter')
  await page.keyboard.type('never saved')
  await page.keyboard.press('Escape')
  await expect(newInput(page)).toHaveCount(0)
  await expect(handle(page, 'B')).toBeFocused()
  expect(await shape(page)).toEqual(['1:A', '2:a1', '2:a2', '1:B'])
  expect(posts).toHaveLength(0)
  expect(await serverParents(page, projectId)).not.toHaveProperty('never saved')
})

test('an empty commit cancels instead of creating a blank task', async ({ page }) => {
  await seed(page)
  const posts = recordCreates(page)

  await handle(page, 'B').focus()
  await page.keyboard.press('Alt+Enter')
  await page.keyboard.press('Enter')
  await expect(newInput(page)).toHaveCount(0)
  await expect(handle(page, 'B')).toBeFocused()

  // Whitespace is empty too.
  await page.keyboard.press('Alt+Enter')
  await page.keyboard.type('   ')
  await page.keyboard.press('Enter')
  await expect(newInput(page)).toHaveCount(0)

  // Blurring an empty input cancels it as well.
  await page.keyboard.press('Alt+Enter')
  await expect(newInput(page)).toBeFocused()
  await page.getByRole('heading', { name: 'Tasks', exact: true }).click()
  await expect(newInput(page)).toHaveCount(0)

  expect(await shape(page)).toEqual(['1:A', '2:a1', '2:a2', '1:B'])
  expect(posts).toHaveLength(0)
})

test('Enter that confirms an IME candidate does not submit', async ({ page }) => {
  await seed(page)
  const posts = recordCreates(page)
  await handle(page, 'B').focus()
  await page.keyboard.press('Alt+Enter')
  await newInput(page).fill('ni')
  await newInput(page).dispatchEvent('keydown', { key: 'Enter', isComposing: true })
  await expect(newInput(page)).toHaveValue('ni')
  expect(posts).toHaveLength(0)
  // A real Enter afterwards does submit, so the silence above is the guard and not a dead input.
  const created = createdOk(page)
  await page.keyboard.press('Enter')
  await created
  expect(posts).toHaveLength(1)
})

test('plain Enter on a handle still opens the detail and Tab still leaves the tree', async ({
  page,
}) => {
  await seed(page)
  await handle(page, 'B').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(newInput(page)).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(handle(page, 'B')).toBeFocused()
  // Tab is not bound: it moves focus off the handle instead of being swallowed.
  await page.keyboard.press('Tab')
  await expect(handle(page, 'B')).not.toBeFocused()
})

test('the new-task box on the project page keeps focus after creating', async ({ page }) => {
  await seed(page)
  const created = createdOk(page)
  await page.getByPlaceholder('New task').fill('quick')
  await page.getByPlaceholder('New task').press('Enter')
  await created
  await expect(row(page, 'quick')).toBeVisible()
  await expect(page.getByPlaceholder('New task')).toBeFocused()
  await expect(page.getByPlaceholder('New task')).toHaveValue('')
})

test('capture confirms where the task went, and the line goes on the next keystroke', async ({
  page,
}) => {
  await registerFreshUser(page)
  const projects = await (await page.request.get('/api/v1/projects')).json()
  const inbox = projects.projects.find((p: { isInbox: boolean }) => p.isInbox)
  const line = page.getByRole('status').filter({ hasText: 'Added to' })
  await expect(line).toHaveCount(0)

  await submitCreate(page, 'Capture…', '问问房东')
  await expect(line).toBeVisible()
  await expect(line.getByRole('link', { name: inbox.name })).toHaveAttribute(
    'href',
    `/projects/${inbox.id}`,
  )

  // One line, in place: a second capture does not stack another beneath it.
  await submitCreate(page, 'Capture…', '第二件事')
  await expect(line).toHaveCount(1)

  await page.getByPlaceholder('Capture…').press('x')
  await expect(line).toHaveCount(0)
})

test('the capture line goes when the user navigates away', async ({ page }) => {
  await registerFreshUser(page)
  await submitCreate(page, 'Capture…', '问问房东')
  const line = page.getByRole('status').filter({ hasText: 'Added to' })
  await expect(line).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Projects' })
    .click()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(line).toHaveCount(0)
})

test('the New task box is empty for the next title once the server has the last', async ({
  page,
}) => {
  await registerFreshUser(page)
  await page.goto(`/projects/${await makeProject(page, 'Rapid')}`)
  const box = page.getByRole('textbox', { name: 'New task', exact: true })
  await box.waitFor()
  // The list read after the save is slow; the box must not wait for it.
  await slowReads(page, '**/api/v1/tasks?projectId=*')
  const posted = page.waitForResponse(
    (r) => r.request().method() === 'POST' && POST_TASK.test(new URL(r.url()).pathname),
  )
  await box.fill('first')
  await box.press('Enter')
  await posted
  await box.pressSequentially('second', { delay: 20 })
  await expect(box).toHaveValue('second')
})
