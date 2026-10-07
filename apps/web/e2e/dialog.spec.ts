import { expect, test, type Page } from '@playwright/test'
import { registerFreshUser } from './helpers'

/**
 * 「新建」浮层 and the one overlay migrated onto Radix (radix-and-create spec §3 and §2).
 *
 * The point of the migration half is that NOTHING the user can observe changed, so the five
 * behaviours `ShortcutHelp` had before are asserted here item by item -- including the one nothing
 * pinned before (focus coming back), which is exactly the kind of thing a hand-rolled overlay gets
 * right and a careless library swap loses.
 */

const HEADERS = { 'x-ctws-client': 'web' }

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dayOffset = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return ymd(d)
}

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

const dialog = (page: Page) => page.getByRole('dialog', { name: '新建任务' })
const openButton = (page: Page) => page.getByRole('button', { name: '新建…', exact: true })
const titleField = (page: Page) => dialog(page).getByRole('textbox', { name: '标题' })

async function makeProject(page: Page, name: string): Promise<string> {
  const res = await page.request.post('/api/v1/projects', { headers: HEADERS, data: { name } })
  expect(res.ok()).toBeTruthy()
  return ((await res.json()) as { id: string }).id
}

async function makeTask(page: Page, projectId: string, title: string): Promise<string> {
  const res = await page.request.post('/api/v1/tasks', {
    headers: HEADERS,
    data: { projectId, title, parentId: null },
  })
  expect(res.ok()).toBeTruthy()
  return ((await res.json()) as { id: string }).id
}

/** A project holding one root task, open on its page with the tree loaded. */
async function seed(page: Page, name = 'P'): Promise<{ pid: string; rootId: string }> {
  await registerFreshUser(page)
  const pid = await makeProject(page, name)
  const rootId = await makeTask(page, pid, '放在我下面')
  await page.goto(`/projects/${pid}`)
  await expect(page.getByRole('listitem')).toHaveCount(1)
  return { pid, rootId }
}

test('创建 writes the title, project, parent, status, plan, deadline and notes in ONE request', async ({
  page,
}) => {
  const { pid, rootId } = await seed(page)
  const writes = recordWrites(page)

  await openButton(page).click()
  await expect(dialog(page)).toBeVisible()
  // The title has focus the moment it opens: the dialog is a thing to type into.
  await expect(titleField(page)).toBeFocused()

  await titleField(page).fill('带细节的任务')
  await dialog(page).getByLabel('放在谁下面').selectOption(rootId)
  await dialog(page).getByRole('radio', { name: '进行中', exact: true }).check()
  await dialog(page).getByRole('button', { name: '排到明天' }).click()
  await dialog(page).getByRole('button', { name: '明天截止' }).click()
  await dialog(page).getByLabel('备注').fill('记一句')

  const posted = nextCreate(page)
  await dialog(page).getByRole('button', { name: '创建', exact: true }).click()
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
  await dialog(page).getByRole('radio', { name: '待办', exact: true }).check()
  await dialog(page).getByRole('button', { name: '排到今天' }).click()

  await titleField(page).fill('第一条')
  let posted = nextCreate(page)
  await page.keyboard.press('ControlOrMeta+Enter')
  expect(((await posted) as { title: string }).title).toBe('第一条')

  // Still open, title empty and focused: adding several in a row costs no mouse and no reopen.
  // The settle is deliberate: "it did NOT close" is a claim about a window of time, and asserted
  // in the same breath as the response it would be satisfied by a dialog that is merely still on
  // its way out -- which then gets caught by the title assertion instead, i.e. by the wrong one.
  await page.waitForTimeout(300)
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
  const handle = page.getByRole('button', { name: '任务：放在我下面', exact: true })
  await handle.focus()
  await page.keyboard.press('n')
  await expect(dialog(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  await expect(handle).toBeFocused()

  // 取消 is the same decision with a mouse.
  await openButton(page).click()
  // `exact`: accessible names are one flat namespace matched by substring, and 取消截止 is in
  // this very dialog.
  await dialog(page).getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog(page)).toHaveCount(0)
  expect(writes).toEqual([])
})

test('an empty title creates nothing and says so', async ({ page }) => {
  await seed(page)
  const writes = recordWrites(page)

  await openButton(page).click()
  await dialog(page).getByRole('button', { name: '创建', exact: true }).click()
  await expect(dialog(page).getByRole('alert')).toHaveText('请先写标题')
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

  // Not while typing: `n` is a letter in the capture box.
  await page.getByLabel('捕获').fill('')
  await page.getByLabel('捕获').press('n')
  await expect(dialog(page)).toHaveCount(0)
  await expect(page.getByLabel('捕获')).toHaveValue('n')

  await page.getByRole('heading', { level: 1 }).click()
  await page.keyboard.press('n')
  await expect(dialog(page)).toBeVisible()
  await page.keyboard.press('Escape')

  // It is a single-key shortcut, so the off switch governs it like every other one.
  await page.getByRole('button', { name: '键盘快捷键' }).click()
  await page.getByRole('checkbox', { name: /启用单键快捷键/ }).uncheck()
  await page.keyboard.press('Escape')
  await page.getByRole('heading', { level: 1 }).click()
  await page.keyboard.press('n')
  await expect(dialog(page)).toHaveCount(0)
  // And the button still is the way in, which is why a key being off is not a dead end.
  await openButton(page).click()
  await expect(dialog(page)).toBeVisible()
})

test('the quick paths are untouched: the 新任务 box and / still behave exactly as before', async ({
  page,
}) => {
  const { pid } = await seed(page)

  // Enter in the 新任务 box still files the line and keeps the box focused and empty -- and does
  // NOT open the dialog. 「敲一行回车即落」 is a success criterion; 新建 is an addition to it.
  const created = page.waitForResponse((r) => isCreate(r.request().method(), r.url()) && r.ok())
  await page.getByPlaceholder('新任务').fill('一行就走')
  await page.getByPlaceholder('新任务').press('Enter')
  await created
  await expect(page.getByPlaceholder('新任务')).toBeFocused()
  await expect(page.getByPlaceholder('新任务')).toHaveValue('')
  await expect(dialog(page)).toHaveCount(0)
  await expect(page.getByRole('listitem')).toHaveCount(2)

  // `/` still jumps to capture, and capture still files to the inbox with its landing line.
  await page.getByRole('heading', { level: 1 }).click()
  await page.keyboard.press('/')
  await expect(page.getByLabel('捕获')).toBeFocused()
  const captured = page.waitForResponse((r) => isCreate(r.request().method(), r.url()) && r.ok())
  await page.getByLabel('捕获').fill('扔进收件箱')
  await page.getByLabel('捕获').press('Enter')
  await captured
  await expect(page.getByRole('status').filter({ hasText: '已放入' })).toBeVisible()
  await expect(page.getByLabel('捕获')).toHaveValue('')

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
    .getByLabel('备注')
    .fill('一段不短的备注，用来把这块内容撑开看看会不会顶出横向滚动条')

  const over = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }))
  expect(over).toEqual({ doc: 0, body: 0 })

  // The document alone is not enough, and a mutation proved it: the scrim is its own scroll
  // container, so a panel too wide for a phone scrolls INSIDE it and the page above stays clean.
  // What has to be true is that the panel fits the viewport and the scrim has nothing to scroll.
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
 * The settle before the assertion is the whole point: the steal happens AFTER the search box has
 * taken focus, so an assertion made in the same breath as the keypress is satisfied by the state
 * that is about to be destroyed.
 */
test('closing the ? list and pressing f leaves focus in the search box', async ({ page }) => {
  await seed(page)

  await page.getByRole('button', { name: '键盘快捷键' }).click()
  await expect(page.getByRole('dialog', { name: '键盘快捷键' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('f')
  const search = page.getByRole('combobox', { name: '搜索任务' })
  await expect(search).toBeVisible()
  await page.waitForTimeout(300)
  await expect(search).toBeFocused()
  // And typing really goes there, which is what "focused" is for.
  await page.keyboard.type('abc')
  await expect(search).toHaveValue('abc')
})

/**
 * THE MIGRATION PROOF. `ShortcutHelp` is the one overlay moved onto Radix this stage, and its five
 * behaviours are asserted one by one -- the four that were already pinned elsewhere, plus the
 * focus restoration that was not.
 */
test('the migrated ? overlay keeps all five of its behaviours', async ({ page }) => {
  await seed(page)

  // 1. `?` opens it.
  await page.getByRole('heading', { level: 1 }).click()
  await page.keyboard.press('?')
  const help = page.getByRole('dialog', { name: '键盘快捷键' })
  await expect(help).toBeVisible()
  // It still SAYS what it says, including the new project-page key.
  for (const key of ['/', 'f', '?', 'n', 'g t', 'Alt+Enter', 's', 'x']) {
    await expect(help.getByText(key, { exact: true }).first()).toBeVisible()
  }

  // The document-level single keys stand down under an open layer, as they did before the
  // migration: `f` here would otherwise stack a search dialog on top of the list.
  await page.keyboard.press('f')
  // By attribute, NOT by role: a modal layer marks the rest of the page `aria-hidden`, so a
  // search dialog that really had stacked underneath would be invisible to `getByRole` and the
  // assertion would pass on a stacked dialog. A mutation proved exactly that.
  await expect(page.locator('input[aria-label="搜索任务"]')).toHaveCount(0)
  await expect(help).toBeVisible()

  // 2. Escape closes it. 4. And focus goes back to what opened it.
  await page.keyboard.press('Escape')
  await expect(help).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()

  // 3. A click outside closes it.
  await page.getByRole('button', { name: '键盘快捷键' }).click()
  await expect(help).toBeVisible()
  await page.mouse.click(5, 5)
  await expect(help).toHaveCount(0)
  // 4 again, from the toolbar button this time.
  await expect(page.getByRole('button', { name: '键盘快捷键' })).toBeFocused()

  // 5. The single-key off switch is still in it and still works -- and still comes back on.
  await page.keyboard.press('?')
  const toggle = help.getByRole('checkbox', { name: /启用单键快捷键/ })
  await expect(toggle).toBeChecked()
  await toggle.uncheck()
  await page.keyboard.press('Escape')
  await page.getByRole('heading', { level: 1 }).click()
  await page.keyboard.press('?')
  await expect(help).toHaveCount(0)
  await page.getByRole('button', { name: '键盘快捷键' }).click()
  await help.getByRole('checkbox', { name: /启用单键快捷键/ }).check()
  await page.keyboard.press('Escape')
  await page.getByRole('heading', { level: 1 }).click()
  await page.keyboard.press('?')
  await expect(help).toBeVisible()
})
