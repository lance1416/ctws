import { expect, test, type Page } from '@playwright/test'
import {
  makeProject,
  makeTask,
  pickOne,
  registerFreshUser,
  serverTasks,
  sidewaysScroll,
  captureBox,
  openCapture,
  headNew,
  openNewTask,
  keyAsShown,
} from './helpers'
import { dayOffset, ymd } from './days'

const POST_TASK = /\/api\/v1\/tasks$/
const isCreate = (method: string, url: string) =>
  method === 'POST' && POST_TASK.test(new URL(url).pathname)

/** Every request the page sends that could write a task, so a test can assert there was one. */
function recordWrites(page: Page) {
  const writes: string[] = []
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname
    if (/\/api\/v1\/tasks/.test(path) && r.method() !== 'GET') writes.push(`${r.method()} ${path}`)
  })
  return writes
}

/**
 * The body of the next task creation, resolved only once the server has answered it. Waiting on
 * the request alone races the test's own next read, which could see the database before the write.
 */
const nextCreate = (page: Page) =>
  page
    .waitForResponse((r) => isCreate(r.request().method(), r.url()) && r.ok())
    .then((r) => r.request().postDataJSON())

const dialog = (page: Page) => page.getByRole('dialog', { name: 'New task' })
const titleField = (page: Page) => dialog(page).getByRole('textbox', { name: 'Title' })

/** A project holding one root task, open on its page with the tree loaded. */
async function seed(page: Page, name = 'P'): Promise<{ pid: string; rootId: string }> {
  await registerFreshUser(page)
  const pid = await makeProject(page, name)
  const rootId = await makeTask(page, pid, '放在我下面')
  await page.goto(`/projects/${pid}`)
  await expect(page.locator('[data-task-tree]').getByText('放在我下面')).toBeVisible()
  return { pid, rootId }
}

test('Create writes the title, project, parent, status, plan, deadline and notes in ONE request', async ({
  page,
}) => {
  const { pid, rootId } = await seed(page)
  const writes = recordWrites(page)

  await openNewTask(page)
  await expect(dialog(page)).toBeVisible()
  await expect(titleField(page)).toBeFocused()

  await titleField(page).fill('带细节的任务')
  await pickOne(dialog(page), 'Put it under', '放在我下面')
  await dialog(page).getByRole('radio', { name: 'In progress', exact: true }).check()
  await dialog(page).getByRole('button', { name: 'Plan for tomorrow' }).click()
  await dialog(page).getByRole('button', { name: 'Due tomorrow' }).click()
  await dialog(page).getByLabel('Notes').fill('记一句')

  const posted = nextCreate(page)
  await dialog(page).getByRole('button', { name: 'Create', exact: true }).click()
  const body = (await posted) as Record<string, unknown>

  // One POST carries the whole task, so a half-made row never exists on the server.
  expect(Object.keys(body).sort()).toEqual(
    ['dueAt', 'notes', 'parentId', 'projectId', 'scheduledOn', 'status', 'title'].sort(),
  )
  expect(body.title).toBe('带细节的任务')
  expect(body.projectId).toBe(pid)
  expect(body.parentId).toBe(rootId)
  expect(body.status).toBe('in_progress')
  expect(body.scheduledOn).toBe(dayOffset(1))
  expect(body.notes).toBe('记一句')
  expect(ymd(new Date(body.dueAt as string))).toBe(dayOffset(1))

  // And exactly one write: no POST followed by a PATCH.
  await expect(dialog(page)).toHaveCount(0)
  await expect(page.getByRole('listitem')).toHaveCount(2)
  expect(writes).toEqual(['POST /api/v1/tasks'])

  // The task really landed as described, read back from the server rather than from the screen.
  const listed = await serverTasks(page, pid)
  const made = (listed as Record<string, unknown>[]).find((t) => t.title === '带细节的任务')!
  expect(made.parentId).toBe(rootId)
  expect(made.status).toBe('in_progress')
  expect(made.scheduledOn).toBe(dayOffset(1))
  expect(made.notes).toBe('记一句')
})

test('⌘↵ creates and stays open, with the title cleared and focused', async ({ page }) => {
  const { pid } = await seed(page)
  await openNewTask(page)
  await dialog(page).getByRole('radio', { name: 'To do', exact: true }).check()
  await dialog(page).getByRole('button', { name: 'Plan for today' }).click()

  await titleField(page).fill('第一条')
  let posted = nextCreate(page)
  await page.keyboard.press('ControlOrMeta+Enter')
  expect(((await posted) as { title: string }).title).toBe('第一条')

  // A dialog merely on its way out would pass these; the second create below proves it stayed.
  await expect(dialog(page)).toBeVisible()
  await expect(titleField(page)).toHaveValue('')
  await expect(titleField(page)).toBeFocused()

  // The rest of the form was kept: the second task gets the same project, status and plan.
  await titleField(page).fill('第二条')
  posted = nextCreate(page)
  await page.keyboard.press('ControlOrMeta+Enter')
  const second = (await posted) as Record<string, unknown>
  expect(second.title).toBe('第二条')
  expect(second.status).toBe('todo')
  expect(second.scheduledOn).toBe(dayOffset(0))
  expect(second.projectId).toBe(pid)

  // Both are on the server, and the layer is still up.
  await expect(dialog(page)).toBeVisible()
  const listed = await serverTasks(page, pid)
  expect((listed as { title: string }[]).map((t) => t.title).sort()).toEqual(
    ['放在我下面', '第一条', '第二条'].sort(),
  )
})

test('Escape closes the dialog and hands focus back to whatever opened it', async ({ page }) => {
  await seed(page)
  const writes = recordWrites(page)

  await openNewTask(page)
  await titleField(page).fill('不会被创建')
  // Closed without asking: what was typed is kept for the next time it opens.
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  await expect(headNew(page)).toBeFocused()
  expect(writes).toEqual([])

  // Opened from a task row by N T, focus goes back to that row, not to the button or <body>.
  const handle = page.getByRole('button', { name: 'Task: 放在我下面', exact: true })
  await handle.focus()
  await page.keyboard.press('n')
  await page.keyboard.press('t')
  await expect(dialog(page)).toBeVisible()
  await expect(titleField(page)).toHaveValue('不会被创建')
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  await expect(handle).toBeFocused()

  // Cancel lets it go, asking first; opened again, it is empty.
  await openNewTask(page)
  // `exact`: accessible names are one flat namespace matched by substring, and "Clear the
  // deadline" is in this very dialog.
  await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).click()
  await dialog(page).getByRole('button', { name: 'Discard changes' }).click()
  await expect(dialog(page)).toHaveCount(0)
  await openNewTask(page)
  await expect(titleField(page)).toHaveValue('')
  expect(writes).toEqual([])
})

test('an empty title creates nothing and says so', async ({ page }) => {
  await seed(page)
  const writes = recordWrites(page)

  await openNewTask(page)
  await dialog(page).getByRole('button', { name: 'Create', exact: true }).click()
  await expect(dialog(page).getByRole('alert')).toHaveText('Title is required')
  await expect(titleField(page)).toBeFocused()
  await expect(dialog(page)).toBeVisible()

  // Whitespace is empty too.
  await titleField(page).fill('   ')
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(dialog(page)).toBeVisible()
  expect(writes).toEqual([])
})

test('N T opens the dialog, obeys the off switch and is two letters while typing', async ({
  page,
}) => {
  await seed(page)

  // Not while typing: `n` and `t` are letters in the capture box.
  const box = await openCapture(page)
  await box.press('n')
  await box.press('t')
  await expect(dialog(page)).toHaveCount(0)
  await expect(box).toHaveValue('nt')
  await box.press('Escape')

  // Clicks land on the tree's column names rather than the page's <h1>, which is an editable
  // control.
  await page.locator('[data-tree-head]').click()
  await page.keyboard.press('n')
  await page.keyboard.press('t')
  await expect(dialog(page)).toBeVisible()
  await page.keyboard.press('Escape')

  // A single-key shortcut, so the off switch governs it like every other one.
  await page.getByRole('button', { name: 'Keys', exact: true }).click()
  await page.getByRole('switch', { name: /Single-key shortcuts/ }).uncheck()
  await page.keyboard.press('Escape')
  await page.locator('[data-tree-head]').click()
  await page.keyboard.press('n')
  await page.keyboard.press('t')
  await expect(dialog(page)).toHaveCount(0)
  // The button is still the way in.
  await openNewTask(page)
  await expect(dialog(page)).toBeVisible()
})

test('the quick paths are untouched: the new-task box and capture behave as they did', async ({
  page,
}) => {
  const { pid } = await seed(page)

  // Enter in the new-task box files the line and keeps the box focused and empty, without the
  // dialog.
  const created = page.waitForResponse((r) => isCreate(r.request().method(), r.url()) && r.ok())
  await page.getByPlaceholder('New task').fill('一行就走')
  await page.getByPlaceholder('New task').press('Enter')
  await created
  await expect(page.getByPlaceholder('New task')).toBeFocused()
  await expect(page.getByPlaceholder('New task')).toHaveValue('')
  await expect(dialog(page)).toHaveCount(0)
  await expect(page.getByRole('listitem')).toHaveCount(2)

  // `c` opens capture, and capture still files to the inbox with its landing line.
  await page.locator('[data-tree-head]').click()
  await page.keyboard.press('c')
  await expect(captureBox(page)).toBeFocused()
  const captured = page.waitForResponse((r) => isCreate(r.request().method(), r.url()) && r.ok())
  await captureBox(page).fill('扔进收件箱')
  await captureBox(page).press('Enter')
  await captured
  await expect(page.getByRole('status').filter({ hasText: 'Added to' })).toBeVisible()
  await expect(captureBox(page)).toHaveValue('')

  // The inbox line did not go into this project.
  const listed = await serverTasks(page, pid)
  expect((listed as { title: string }[]).map((t) => t.title).sort()).toEqual(
    ['一行就走', '放在我下面'].sort(),
  )
})

test('the dialog fits 375px with no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 })
  await seed(page)
  await openNewTask(page)
  await expect(dialog(page)).toBeVisible()
  await dialog(page)
    .getByLabel('Notes')
    .fill('一段不短的备注，用来把这块内容撑开看看会不会顶出横向滚动条')

  const over = await sidewaysScroll(page)
  expect(over).toEqual({ doc: 0, body: 0 })

  // The document alone is not enough: the scrim is its own scroll container, so a panel too wide
  // for a phone scrolls inside it while the page stays clean.
  const box = (await dialog(page).boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(Math.ceil(box.x + box.width)).toBeLessThanOrEqual(375)
  const scrimOverflow = await dialog(page)
    .locator('xpath=..')
    .evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(scrimOverflow).toBe(0)
})

/**
 * Radix puts focus back a macrotask after the close, so a restore that does not check first pulls
 * focus from the search box back to the button that opened the list. That happens after the search
 * box has taken focus, so typing into it is the proof, not "focused" alone.
 */
test('closing the ? list and pressing Ctrl K leaves focus in the search box', async ({ page }) => {
  await seed(page)

  await page.getByRole('button', { name: 'Keys', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+k')
  const search = page.getByRole('combobox', { name: 'Search' })
  await expect(search).toBeVisible()
  await expect(search).toBeFocused()
  await page.keyboard.type('abc')
  await expect(search).toHaveValue('abc')
})

/** The `?` overlay's five behaviours, one by one. */
test('the ? overlay opens, lists the keys, closes two ways, restores focus and holds the switch', async ({
  page,
}) => {
  await seed(page)

  // 1. `?` opens it, pressed from a focusable control that is not a text field, so focus has
  // something to go back to.
  await headNew(page).focus()
  await page.keyboard.press('?')
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(help).toBeVisible()
  // It says every key, including the project page's own.
  for (const key of [
    await keyAsShown(page, 'Ctrl+K'),
    'C',
    '?',
    'N',
    'G',
    await keyAsShown(page, 'Alt+Enter'),
    'S',
    'X',
  ]) {
    await expect(help.getByText(key, { exact: true }).first()).toBeVisible()
  }

  // The document-level keys stand down under an open layer: Ctrl K here would otherwise stack
  // a search dialog on top of the list.
  await page.keyboard.press('Control+k')
  // By attribute, not by role: a modal layer marks the rest of the page `aria-hidden`, so a search
  // dialog stacked underneath is invisible to `getByRole`.
  await expect(page.locator('input[aria-label="Search"]')).toHaveCount(0)
  await expect(help).toBeVisible()

  // 2. Escape closes it. 4. And focus goes back to what opened it.
  await page.keyboard.press('Escape')
  await expect(help).toHaveCount(0)
  await expect(headNew(page)).toBeFocused()

  // 3. A click outside closes it.
  await page.getByRole('button', { name: 'Keys', exact: true }).click()
  await expect(help).toBeVisible()
  await page.mouse.click(5, 5)
  await expect(help).toHaveCount(0)
  // 4 again, from the toolbar button this time.
  await expect(page.getByRole('button', { name: 'Keys', exact: true })).toBeFocused()

  // 5. The single-key off switch is in it, works, and comes back on.
  await page.keyboard.press('?')
  const toggle = help.getByRole('switch', { name: /Single-key shortcuts/ })
  await expect(toggle).toBeChecked()
  await toggle.uncheck()
  await page.keyboard.press('Escape')
  await page.locator('[data-tree-head]').click()
  await page.keyboard.press('?')
  await expect(help).toHaveCount(0)
  await page.getByRole('button', { name: 'Keys', exact: true }).click()
  await help.getByRole('switch', { name: /Single-key shortcuts/ }).check()
  await page.keyboard.press('Escape')
  await page.locator('[data-tree-head]').click()
  await page.keyboard.press('?')
  await expect(help).toBeVisible()
})

test('a task made in the New dialog starts as to do, like one typed into the list', async ({
  page,
}) => {
  await seed(page)
  await openNewTask(page)
  await expect(dialog(page).getByRole('radio', { name: 'To do', exact: true })).toBeChecked()
  await titleField(page).fill('照常开始')
  const posted = nextCreate(page)
  await dialog(page).getByRole('button', { name: 'Create', exact: true }).click()
  expect(((await posted) as Record<string, unknown>).status).toBe('todo')
})

test('the ? list is the board’s three columns, and its switch names the keys it stops', async ({
  page,
}) => {
  await seed(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: 'Keys', exact: true }).click()
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  // Last in the list, one line: the switch and the keys it stops, as caps.
  const toggle = help.getByRole('switch', { name: /Single-key shortcuts/ })
  await expect(toggle).toBeVisible()
  const line = help.locator('label:has([role="switch"])')
  for (const cap of ['C', 'L', '?', '[', 'G', 'N', 'S', 'X', 'J', 'K'])
    await expect(line.getByText(cap, { exact: true })).toBeVisible()
  // Today's row keys are the tree's, said once.
  const sections = await help.getByRole('heading', { level: 3 }).allTextContents()
  expect(sections).toEqual([
    'Anywhere',
    'Go to',
    'On a note',
    'New',
    'On a project',
    'On a board, with a card focused',
    'On the Workbench',
    'In a tree or list, with a row focused',
    'In search',
    'In a form',
  ])
  await expect(help).toContainText('Fold, or go to the parent')
  await expect(help).toContainText('Unfold, or go to the first subtask')
  await expect(help).toContainText('Open a pinned resource')
  await expect(help).toContainText('Switch between tree and board')
  await expect(help).toContainText('Open a launcher link')
  // Three columns that fit the screen: the foot is on it.
  const foot = help.getByText('This key changes in the redesign.', { exact: false })
  const box = (await help.boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(900)
  await expect(foot).toBeVisible()
})

test('a layer opened by a click that left focus on the page gives focus back to that button', async ({
  page,
}) => {
  await registerFreshUser(page)
  const keys = page.getByRole('button', { name: 'Keys', exact: true })
  // Safari on macOS: the press does not focus the button, so <body> is focused when it opens.
  await keys.evaluate((el: HTMLElement) => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    el.click()
  })
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(help).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(help).toHaveCount(0)
  await expect(keys).toBeFocused()
})

test('Option+Tab wraps at the ends of a layer, as Tab does', async ({ page }) => {
  await registerFreshUser(page)
  await page.keyboard.press('?')
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  const filter = help.getByRole('textbox', { name: 'Filter keys' })
  await expect(filter).toBeFocused()
  await page.keyboard.press('Alt+Shift+Tab')
  await expect(filter).not.toBeFocused()
  await expect(help.locator(':focus')).toHaveCount(1)
  await page.keyboard.press('Alt+Tab')
  await expect(filter).toBeFocused()
})
