import { expect, test, type Page } from '@playwright/test'
import { makeProject, makeTask, pickOne, registerFreshUser, sidewaysScroll } from './helpers'
import { dayOffset, ymd } from './days'

/**
 * THE NEW-TASK LAYER, and the overlays that sit on Radix.
 *
 * The point of the migration half is that NOTHING the user can observe changed, so the five
 * behaviours `ShortcutHelp` had before are asserted here item by item -- including the one nothing
 * pinned before (focus coming back), which is exactly the kind of thing a hand-rolled overlay gets
 * right and a careless library swap loses.
 */

const POST_TASK = /\/api\/v1\/tasks$/
const isCreate = (method: string, url: string) =>
  method === 'POST' && POST_TASK.test(new URL(url).pathname)

/** Every request the page sends that could write a task, so a test can assert there was ONE. */
function recordWrites(page: Page) {
  const writes: string[] = []
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname
    if (/\/api\/v1\/tasks/.test(path) && r.method() !== 'GET') writes.push(`${r.method()} ${path}`)
  })
  return writes
}

/**
 * The body of the next task creation, resolved only once the SERVER has answered it. Waiting on
 * the request alone is a race with the test's own next read: a `GET` issued between the POST
 * leaving and the row existing reports a database that has not been written yet.
 */
const nextCreate = (page: Page) =>
  page
    .waitForResponse((r) => isCreate(r.request().method(), r.url()) && r.ok())
    .then((r) => r.request().postDataJSON())

const dialog = (page: Page) => page.getByRole('dialog', { name: 'New task' })
const openButton = (page: Page) => page.getByRole('button', { name: 'New…', exact: true })
const titleField = (page: Page) => dialog(page).getByRole('textbox', { name: 'Title' })

/** A project holding one root task, open on its page with the tree loaded. */
async function seed(page: Page, name = 'P'): Promise<{ pid: string; rootId: string }> {
  await registerFreshUser(page)
  const pid = await makeProject(page, name)
  const rootId = await makeTask(page, pid, '放在我下面')
  await page.goto(`/projects/${pid}`)
  await expect(page.getByRole('listitem')).toHaveCount(1)
  return { pid, rootId }
}

test('Create writes the title, project, parent, status, plan, deadline and notes in ONE request', async ({
  page,
}) => {
  const { pid, rootId } = await seed(page)
  const writes = recordWrites(page)

  await openButton(page).click()
  await expect(dialog(page)).toBeVisible()
  // The title has focus the moment it opens: the dialog is a thing to type into.
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

  // The BODY, not the screen: what is being pinned is that one POST carries the whole task, so a
  // half-made row never exists on the server.
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
  const listed = await (await page.request.get(`/api/v1/tasks?projectId=${pid}`)).json()
  const made = (listed.tasks as Record<string, unknown>[]).find((t) => t.title === '带细节的任务')!
  expect(made.parentId).toBe(rootId)
  expect(made.status).toBe('in_progress')
  expect(made.scheduledOn).toBe(dayOffset(1))
  expect(made.notes).toBe('记一句')
})

test('⌘↵ creates and stays open, with the title cleared and focused', async ({ page }) => {
  const { pid } = await seed(page)
  await openButton(page).click()
  await dialog(page).getByRole('radio', { name: 'To do', exact: true }).check()
  await dialog(page).getByRole('button', { name: 'Plan for today' }).click()

  await titleField(page).fill('第一条')
  let posted = nextCreate(page)
  await page.keyboard.press('ControlOrMeta+Enter')
  expect(((await posted) as { title: string }).title).toBe('第一条')

  // Still open, title empty and focused: adding several in a row costs no mouse and no reopen. A
  // dialog merely on its way out would pass these; the second create below, from the same layer,
  // is what proves it stayed.
  await expect(dialog(page)).toBeVisible()
  await expect(titleField(page)).toHaveValue('')
  await expect(titleField(page)).toBeFocused()

  // The rest of the form was KEPT, which is the whole reason to stay: the second task gets the
  // same project, status and plan without them being set again.
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
  const listed = await (await page.request.get(`/api/v1/tasks?projectId=${pid}`)).json()
  expect((listed.tasks as { title: string }[]).map((t) => t.title).sort()).toEqual(
    ['放在我下面', '第一条', '第二条'].sort(),
  )
})

test('Escape closes the dialog and hands focus back to whatever opened it', async ({ page }) => {
  await seed(page)
  const writes = recordWrites(page)

  await openButton(page).click()
  await titleField(page).fill('不会被创建')
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  await expect(openButton(page)).toBeFocused()
  expect(writes).toEqual([])

  // Opened from a task row by `n`, focus goes back to THAT row rather than to the button or, worse,
  // to <body> (WCAG 2.4.3).
  const handle = page.getByRole('button', { name: 'Task: 放在我下面', exact: true })
  await handle.focus()
  await page.keyboard.press('n')
  await expect(dialog(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  await expect(handle).toBeFocused()

  // Cancel is the same decision with a mouse.
  await openButton(page).click()
  // `exact`: accessible names are one flat namespace matched by substring, and "Clear the
  // deadline" is in
  // this very dialog.
  await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog(page)).toHaveCount(0)
  expect(writes).toEqual([])
})

test('an empty title creates nothing and says so', async ({ page }) => {
  await seed(page)
  const writes = recordWrites(page)

  await openButton(page).click()
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

test('`n` opens the dialog, obeys the off switch and is a letter while typing', async ({
  page,
}) => {
  await seed(page)

  // Clicks land on the Tasks block's heading rather than the page's <h1>: the project title is
  // an editable control, so clicking it opens a text field and the next keypress is
  // typing. A block heading is the neutral spot this needs.
  // Not while typing: `n` is a letter in the capture box.
  await page.getByLabel('Capture').fill('')
  await page.getByLabel('Capture').press('n')
  await expect(dialog(page)).toHaveCount(0)
  await expect(page.getByLabel('Capture')).toHaveValue('n')

  await page.getByRole('heading', { name: 'Tasks', exact: true }).click()
  await page.keyboard.press('n')
  await expect(dialog(page)).toBeVisible()
  await page.keyboard.press('Escape')

  // It is a single-key shortcut, so the off switch governs it like every other one.
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click()
  await page.getByRole('checkbox', { name: /Single-key shortcuts/ }).uncheck()
  await page.keyboard.press('Escape')
  await page.getByRole('heading', { name: 'Tasks', exact: true }).click()
  await page.keyboard.press('n')
  await expect(dialog(page)).toHaveCount(0)
  // And the button still is the way in, which is why a key being off is not a dead end.
  await openButton(page).click()
  await expect(dialog(page)).toBeVisible()
})

test('the quick paths are untouched: the new-task box and / behave as they did', async ({
  page,
}) => {
  const { pid } = await seed(page)

  // Enter in the new-task box still files the line and keeps the box focused and empty -- and
  // does NOT open the dialog. One line and Enter is a success criterion; the dialog is an
  // addition to it.
  const created = page.waitForResponse((r) => isCreate(r.request().method(), r.url()) && r.ok())
  await page.getByPlaceholder('New task').fill('一行就走')
  await page.getByPlaceholder('New task').press('Enter')
  await created
  await expect(page.getByPlaceholder('New task')).toBeFocused()
  await expect(page.getByPlaceholder('New task')).toHaveValue('')
  await expect(dialog(page)).toHaveCount(0)
  await expect(page.getByRole('listitem')).toHaveCount(2)

  // `/` still jumps to capture, and capture still files to the inbox with its landing line.
  await page.getByRole('heading', { name: 'Tasks', exact: true }).click()
  await page.keyboard.press('/')
  await expect(page.getByLabel('Capture')).toBeFocused()
  const captured = page.waitForResponse((r) => isCreate(r.request().method(), r.url()) && r.ok())
  await page.getByLabel('Capture').fill('扔进收件箱')
  await page.getByLabel('Capture').press('Enter')
  await captured
  await expect(page.getByRole('status').filter({ hasText: 'Added to' })).toBeVisible()
  await expect(page.getByLabel('Capture')).toHaveValue('')

  // The inbox line did not go into this project.
  const listed = await (await page.request.get(`/api/v1/tasks?projectId=${pid}`)).json()
  expect((listed.tasks as { title: string }[]).map((t) => t.title).sort()).toEqual(
    ['一行就走', '放在我下面'].sort(),
  )
})

test('the dialog fits 375px with no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 })
  await seed(page)
  await openButton(page).click()
  await expect(dialog(page)).toBeVisible()
  await dialog(page)
    .getByLabel('Notes')
    .fill('一段不短的备注，用来把这块内容撑开看看会不会顶出横向滚动条')

  const over = await sidewaysScroll(page)
  expect(over).toEqual({ doc: 0, body: 0 })

  // The document alone is not enough: the scrim is its own scroll container, so a panel too wide
  // for a phone scrolls INSIDE it while the page above stays clean. What has to be true is that
  // the panel fits the viewport and the scrim has nothing to scroll.
  const box = (await dialog(page).boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(Math.ceil(box.x + box.width)).toBeLessThanOrEqual(375)
  const scrimOverflow = await dialog(page)
    .locator('xpath=..')
    .evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(scrimOverflow).toBe(0)
})

/**
 * The layer's focus restoration must STAND DOWN when something else has already claimed the
 * keyboard. Radix puts focus back a macrotask after the close, so a restore that does not check
 * first will reach past the thing the person went on to open -- here, the search box they pressed
 * `f` for -- and pull focus back to the button that opened the list.
 *
 * The steal happens AFTER the search box has taken focus, so "focused" alone can be satisfied by
 * the state about to be destroyed; typing into it afterwards is the proof.
 */
test('closing the ? list and pressing f leaves focus in the search box', async ({ page }) => {
  await seed(page)

  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click()
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('f')
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

  // 1. `?` opens it. It is pressed from the new-task box's NEIGHBOUR -- a focusable control that
  // is not a text field -- so that "focus goes back to what opened it" below has something to go
  // back to. (A heading is not focusable, and the page's <h1> is a rename control.)
  await page.getByRole('button', { name: 'New…', exact: true }).focus()
  await page.keyboard.press('?')
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(help).toBeVisible()
  // It says every key, including the project page's own.
  for (const key of ['/', 'f', '?', 'n', 'g t', 'Alt+Enter', 's', 'x']) {
    await expect(help.getByText(key, { exact: true }).first()).toBeVisible()
  }

  // The document-level single keys stand down under an open layer: `f` here would otherwise stack
  // a search dialog on top of the list.
  await page.keyboard.press('f')
  // By attribute, NOT by role: a modal layer marks the rest of the page `aria-hidden`, so a
  // search dialog stacked underneath is invisible to `getByRole` -- the role query passes
  // precisely in the case this is here to catch.
  await expect(page.locator('input[aria-label="Search"]')).toHaveCount(0)
  await expect(help).toBeVisible()

  // 2. Escape closes it. 4. And focus goes back to what opened it.
  await page.keyboard.press('Escape')
  await expect(help).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'New…', exact: true })).toBeFocused()

  // 3. A click outside closes it.
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click()
  await expect(help).toBeVisible()
  await page.mouse.click(5, 5)
  await expect(help).toHaveCount(0)
  // 4 again, from the toolbar button this time.
  await expect(page.getByRole('button', { name: 'Keyboard shortcuts' })).toBeFocused()

  // 5. The single-key off switch is in it, works, and comes back on.
  await page.keyboard.press('?')
  const toggle = help.getByRole('checkbox', { name: /Single-key shortcuts/ })
  await expect(toggle).toBeChecked()
  await toggle.uncheck()
  await page.keyboard.press('Escape')
  await page.getByRole('heading', { name: 'Tasks', exact: true }).click()
  await page.keyboard.press('?')
  await expect(help).toHaveCount(0)
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click()
  await help.getByRole('checkbox', { name: /Single-key shortcuts/ }).check()
  await page.keyboard.press('Escape')
  await page.getByRole('heading', { name: 'Tasks', exact: true }).click()
  await page.keyboard.press('?')
  await expect(help).toBeVisible()
})

test('a task made in the New dialog starts as to do, like one typed into the list', async ({
  page,
}) => {
  await seed(page)
  await openButton(page).click()
  await expect(dialog(page).getByRole('radio', { name: 'To do', exact: true })).toBeChecked()
  await titleField(page).fill('照常开始')
  const posted = nextCreate(page)
  await dialog(page).getByRole('button', { name: 'Create', exact: true }).click()
  expect(((await posted) as Record<string, unknown>).status).toBe('todo')
})

test('the ? list says what the off switch silences and what → does', async ({ page }) => {
  await seed(page)
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click()
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  // `n` (New) is a single key too, and the switch stops it.
  await expect(help.getByRole('checkbox', { name: /Single-key shortcuts/ })).toBeVisible()
  await expect(help).toContainText('the g chords, n, s, x, j and k stop responding')
  // → opens a collapsed row; only an open one goes on to its first child.
  await expect(help).toContainText('once expanded, → goes to the first child')
})
