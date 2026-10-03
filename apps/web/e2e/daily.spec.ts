import { expect, test, type Page } from '@playwright/test'
import { registerFreshUser } from './helpers'

// The daily loop: finishing, starting and deferring work from the list itself, the dates a tree
// row shows, and the panel / delete guards. Every assertion that a status or date changed reads
// the SERVER (a fresh GET), not the screen: an optimistic update that never reached the API
// would pass any check that only looks at the UI.

const HEADERS = { 'x-ctws-client': 'web' }
const DAY = 86_400_000

type ApiTask = {
  id: string
  title: string
  status: string
  scheduledOn: string | null
  dueAt: string | null
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

async function makeProject(page: Page, name: string): Promise<string> {
  const res = await page.request.post('/api/v1/projects', { headers: HEADERS, data: { name } })
  expect(res.ok()).toBeTruthy()
  return ((await res.json()) as { id: string }).id
}

async function makeTask(
  page: Page,
  projectId: string,
  title: string,
  patch: Record<string, unknown> = {},
): Promise<string> {
  const res = await page.request.post('/api/v1/tasks', {
    headers: HEADERS,
    data: { projectId, title, parentId: null },
  })
  expect(res.ok()).toBeTruthy()
  const id = ((await res.json()) as { id: string }).id
  if (Object.keys(patch).length > 0) {
    const p = await page.request.patch(`/api/v1/tasks/${id}`, { headers: HEADERS, data: patch })
    expect(p.ok()).toBeTruthy()
  }
  return id
}

/** What the server holds for one task, read fresh. */
async function serverTask(page: Page, projectId: string, title: string): Promise<ApiTask> {
  const body = await (await page.request.get(`/api/v1/projects/${projectId}/tasks`)).json()
  const t = (body.tasks as ApiTask[]).find((x) => x.title === title)
  expect(t, `task ${title} on the server`).toBeDefined()
  return t!
}

const isPatch = (r: { url: () => string; request: () => { method: () => string } }) =>
  /\/tasks\/[^/]+$/.test(r.url()) && r.request().method() === 'PATCH'
const patched = (page: Page) => page.waitForResponse((r) => isPatch(r) && r.ok())

const dueAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString()

async function openTree(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`)
  await page.getByRole('listitem').first().waitFor()
}

const treeRow = (page: Page, title: string) =>
  page
    .locator('li[data-depth]')
    .filter({ has: page.getByRole('button', { name: `任务：${title}`, exact: true }) })

// ---------------------------------------------------------------------------------- F2: status

test('the status mark in a tree row finishes the task in one click, and it is saved', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案')
  await openTree(page, pid)

  const requests: string[] = []
  page.on('request', (r) => {
    if (r.method() !== 'GET') requests.push(`${r.method()} ${new URL(r.url()).pathname}`)
  })
  const done = patched(page)
  await page.getByRole('button', { name: '完成「写方案」' }).click()
  const res = await done
  // One request, carrying exactly the status: nothing else rewritten.
  expect(res.request().postDataJSON()).toEqual({ status: 'done' })
  expect(requests).toHaveLength(1)
  // One action: the detail panel never opened.
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // The server has it, and so does a fresh page load.
  expect((await serverTask(page, pid, '写方案')).status).toBe('done')
  await page.reload()
  await expect(treeRow(page, '写方案').getByRole('img', { name: '已完成' })).toBeVisible()
  await expect(page.getByRole('button', { name: '恢复「写方案」' })).toBeVisible()
})

test('a finished task can be restored from its mark, landing on backlog', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案', { status: 'done' })
  await openTree(page, pid)

  const restored = patched(page)
  await page.getByRole('button', { name: '恢复「写方案」' }).click()
  expect((await restored).request().postDataJSON()).toEqual({ status: 'backlog' })
  expect((await serverTask(page, pid, '写方案')).status).toBe('backlog')
  await page.reload()
  await expect(treeRow(page, '写方案').getByRole('img', { name: '待整理' })).toBeVisible()
})

test('starting a task from its row puts it under 正在做, stopping takes it off', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案')
  await openTree(page, pid)

  // A dateless, not-started task is not on the Today page at all.
  await page.getByRole('link', { name: '今天' }).click()
  await expect(page.getByText('今天没有安排的事')).toBeVisible()
  await page.goBack()
  await page.getByRole('listitem').first().waitFor()

  const started = patched(page)
  await page.getByRole('button', { name: '开始「写方案」' }).click()
  expect((await started).request().postDataJSON()).toEqual({ status: 'in_progress' })
  expect((await serverTask(page, pid, '写方案')).status).toBe('in_progress')

  await page.getByRole('link', { name: '今天' }).click()
  await expect(page.getByRole('region', { name: '正在做' }).getByText('写方案')).toBeVisible()

  // Stop it from the Today row: it has no date, so it leaves the page.
  const stopped = patched(page)
  await page.getByRole('button', { name: '暂停「写方案」' }).click()
  expect((await stopped).request().postDataJSON()).toEqual({ status: 'todo' })
  await expect(page.getByText('今天没有安排的事')).toBeVisible()
  expect((await serverTask(page, pid, '写方案')).status).toBe('todo')
})

test('x, then s, on a focused tree row change its status, each saved', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案')
  await openTree(page, pid)
  const handle = page.getByRole('button', { name: '任务：写方案', exact: true })

  await handle.focus()
  let res = patched(page)
  await page.keyboard.press('x')
  expect((await res).request().postDataJSON()).toEqual({ status: 'done' })
  expect((await serverTask(page, pid, '写方案')).status).toBe('done')
  // Focus did not move: the keyboard user can keep going from the same row.
  await expect(handle).toBeFocused()

  res = patched(page)
  await page.keyboard.press('x')
  expect((await res).request().postDataJSON()).toEqual({ status: 'backlog' })

  res = patched(page)
  await page.keyboard.press('s')
  expect((await res).request().postDataJSON()).toEqual({ status: 'in_progress' })
  expect((await serverTask(page, pid, '写方案')).status).toBe('in_progress')

  // A modified key is somebody else's shortcut (Alt+arrows move rows, Ctrl+S saves the page).
  const sent: string[] = []
  page.on('request', (r) => r.method() === 'PATCH' && sent.push(r.url()))
  await page.keyboard.press('Control+s')
  await page.keyboard.press('Alt+x')
  await page.waitForTimeout(300)
  expect(sent).toHaveLength(0)
})

test('a Today row is finished by its mark, by x, and focus moves to the next row', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '甲', { status: 'in_progress' })
  await makeTask(page, pid, '乙', { status: 'in_progress' })
  await makeTask(page, pid, '丙', { status: 'in_progress' })
  await page.goto('/')
  const region = page.getByRole('region', { name: '正在做' })
  await expect(region.getByText('甲')).toBeVisible()
  const order = await page.locator('[data-today-row]').allInnerTexts()
  const firstTitle = order[0]!.split('\n')[0]!
  const secondTitle = order[1]!.split('\n')[0]!

  const first = patched(page)
  await page.getByRole('button', { name: `完成「${firstTitle}」` }).click()
  expect((await first).request().postDataJSON()).toEqual({ status: 'done' })
  await expect(region.getByText(firstTitle, { exact: true })).toHaveCount(0)
  // The clicked row is gone; focus must not have fallen to <body>.
  await expect(page.locator('[data-today-row]').filter({ hasText: secondTitle })).toBeFocused()
  expect((await serverTask(page, pid, firstTitle)).status).toBe('done')

  // Keyboard route on the focused row.
  const second = patched(page)
  await page.keyboard.press('x')
  expect((await second).request().postDataJSON()).toEqual({ status: 'done' })
  await expect(region.getByText(secondTitle, { exact: true })).toHaveCount(0)
  expect((await serverTask(page, pid, secondTitle)).status).toBe('done')

  // Survives a reload: one row is left and it is the one nobody touched.
  await page.reload()
  await expect(page.locator('[data-today-row]')).toHaveCount(1)
})

// ------------------------------------------------------------------------------ F3: overdue exits

test('an overdue row can be pushed to tomorrow or next week: it stays overdue and says where it went', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const due = dueAgo(2)
  await makeTask(page, pid, '回 issue', { dueAt: due })
  await page.goto('/')
  const section = page.getByRole('region', { name: '逾期' })
  await expect(section.getByText('已逾 2 天')).toBeVisible()
  await expect(section.getByText(/^排到/)).toHaveCount(0)

  const tomorrow = ymd(new Date(Date.now() + DAY))
  let res = patched(page)
  await section.getByRole('button', { name: '推迟到明天' }).click()
  expect((await res).request().postDataJSON()).toEqual({ scheduledOn: tomorrow })
  // The deadline is untouched and the row is still in the overdue segment: a missed deadline is
  // missed. What changed is that the row now says it has been dealt with.
  await expect(section.getByText('排到明天')).toBeVisible()
  await expect(section.getByText('已逾 2 天')).toBeVisible()
  const t = await serverTask(page, pid, '回 issue')
  expect(t.scheduledOn).toBe(tomorrow)
  expect(new Date(t.dueAt!).getTime()).toBe(new Date(due).getTime())
  await page.reload()
  await expect(page.getByRole('region', { name: '逾期' }).getByText('排到明天')).toBeVisible()

  // Next week is the coming Monday.
  const now = new Date()
  const toMonday = (8 - now.getDay()) % 7 || 7
  const monday = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + toMonday))
  res = patched(page)
  await page.getByRole('button', { name: '推迟到下周' }).click()
  expect((await res).request().postDataJSON()).toEqual({ scheduledOn: monday })
  expect((await serverTask(page, pid, '回 issue')).scheduledOn).toBe(monday)
})

test('取消截止 takes a row out of overdue and the server forgets the deadline', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '不再重要', { dueAt: dueAgo(3) })
  await makeTask(page, pid, '要留下', { dueAt: dueAgo(1) })
  await page.goto('/')
  const section = page.getByRole('region', { name: '逾期' })
  await expect(section.getByText('不再重要')).toBeVisible()

  const res = patched(page)
  await page
    .getByRole('group', { name: '处理逾期：不再重要' })
    .getByRole('button', { name: '取消截止' })
    .click()
  expect((await res).request().postDataJSON()).toEqual({ dueAt: null })
  await expect(page.getByText('不再重要')).toHaveCount(0)
  // The other overdue row is untouched, and focus went to it rather than to <body>.
  await expect(section.getByText('要留下')).toBeVisible()
  await expect(page.locator('[data-today-row]').filter({ hasText: '要留下' })).toBeFocused()
  expect((await serverTask(page, pid, '不再重要')).dueAt).toBeNull()
  expect((await serverTask(page, pid, '要留下')).dueAt).not.toBeNull()
  await page.reload()
  await expect(page.getByText('不再重要')).toHaveCount(0)
})

test('an overdue row is finished with its mark, and only overdue rows have the exits', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '逾期的', { dueAt: dueAgo(2) })
  await makeTask(page, pid, '在做的', { status: 'in_progress' })
  await page.goto('/')
  await expect(page.getByRole('button', { name: '推迟到明天' })).toHaveCount(1)
  await expect(page.getByRole('button', { name: '取消截止' })).toHaveCount(1)

  const res = patched(page)
  await page.getByRole('button', { name: '完成「逾期的」' }).click()
  expect((await res).request().postDataJSON()).toEqual({ status: 'done' })
  await expect(page.getByRole('region', { name: '逾期' })).toHaveCount(0)
  expect((await serverTask(page, pid, '逾期的')).status).toBe('done')
})

// ------------------------------------------------------------------------------- F4: dates in tree

test('the tree shows dates only where they mean something', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const now = new Date()
  const todayLate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 30)
  await makeTask(page, pid, '逾期的', { dueAt: dueAgo(5) })
  await makeTask(page, pid, '今天截止', { dueAt: todayLate.toISOString() })
  await makeTask(page, pid, '只排期', { scheduledOn: ymd(new Date(now.getTime() + DAY)) })
  await makeTask(page, pid, '没日期')
  await makeTask(page, pid, '已完成逾期', { dueAt: dueAgo(9), status: 'done' })
  await openTree(page, pid)

  const hints = (title: string) => treeRow(page, title).locator('[data-date-hint]')
  await expect(hints('逾期的')).toHaveText('已逾 5 天')
  await expect(hints('逾期的')).toHaveAttribute('data-date-hint', 'overdue')
  await expect(hints('今天截止')).toHaveText('今天 23:30 截止')
  await expect(hints('今天截止')).toHaveAttribute('data-date-hint', 'due')
  await expect(hints('只排期')).toHaveText('排到明天')
  // A dateless row and a finished row carry no date at all: the row is still a row.
  await expect(hints('没日期')).toHaveCount(0)
  await expect(hints('已完成逾期')).toHaveCount(0)

  // Overdue is told apart by its words, not by its colour: the same row without the colour
  // class would still read "已逾 5 天", and the due-today row never says it.
  await expect(treeRow(page, '今天截止')).not.toContainText('已逾')
})

// ---------------------------------------------------------------------------- F5: destructive guards

test('deleting a project asks first, names what is lost, and cancel deletes nothing', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '待删项目')
  for (const t of ['一', '二', '三']) await makeTask(page, pid, t)
  await page.goto('/projects')
  const deletes: string[] = []
  page.on('request', (r) => r.method() === 'DELETE' && deletes.push(r.url()))

  const item = page.getByRole('listitem').filter({ hasText: '待删项目' })
  await item.getByRole('button', { name: '删除', exact: true }).click()
  const ask = item.getByRole('alertdialog')
  await expect(ask).toContainText('删除「待删项目」及其 3 条任务')
  // The first click only asks.
  expect(deletes).toHaveLength(0)

  await ask.getByRole('button', { name: '取消' }).click()
  await expect(ask).toHaveCount(0)
  await page.waitForTimeout(200)
  expect(deletes).toHaveLength(0)
  const list = await (await page.request.get('/api/v1/projects')).json()
  expect(list.projects.map((p: { name: string }) => p.name)).toContain('待删项目')
  expect((await serverTask(page, pid, '二')).status).toBeDefined()
  // And focus is back on the control that asked, not lost to <body>.
  await expect(item.getByRole('button', { name: '删除', exact: true })).toBeFocused()

  // Escape is also "no".
  await item.getByRole('button', { name: '删除', exact: true }).click()
  await expect(ask).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(ask).toHaveCount(0)
  expect(deletes).toHaveLength(0)

  // Only the explicit confirmation deletes, and the server really lost it.
  await item.getByRole('button', { name: '删除', exact: true }).click()
  await ask.getByRole('button', { name: '确认删除' }).click()
  await expect(item).toHaveCount(0)
  expect(deletes).toHaveLength(1)
  const after = await (await page.request.get('/api/v1/projects')).json()
  expect(after.projects.map((p: { name: string }) => p.name)).not.toContain('待删项目')
})

test('closing a panel with unsaved edits asks; keep editing keeps them, discard drops them', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案')
  await openTree(page, pid)
  await page.getByRole('listitem').filter({ hasText: '写方案' }).click()
  const dialog = page.getByRole('dialog')
  await page.getByLabel('标题').fill('写方案 v2')

  // Every way out asks: the button, Escape, and a click outside.
  await page.getByRole('button', { name: '关闭' }).click()
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('有未保存的修改')
  await page.getByRole('button', { name: '继续编辑' }).click()
  await expect(dialog.getByText('有未保存的修改')).toHaveCount(0)
  await expect(page.getByLabel('标题')).toHaveValue('写方案 v2')

  await page.getByLabel('标题').press('Escape')
  await expect(dialog).toContainText('有未保存的修改')
  await page.keyboard.press('Escape') // a second Escape on the prompt means keep editing
  await expect(dialog.getByText('有未保存的修改')).toHaveCount(0)
  await expect(dialog).toBeVisible()

  await page.mouse.click(60, 600)
  await expect(dialog).toContainText('有未保存的修改')

  await page.getByRole('button', { name: '放弃修改' }).click()
  await expect(dialog).toHaveCount(0)
  expect((await serverTask(page, pid, '写方案')).title).toBe('写方案')
  // A panel reopened afterwards is clean again.
  await page.getByRole('listitem').filter({ hasText: '写方案' }).click()
  await expect(page.getByLabel('标题')).toHaveValue('写方案')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

// -------------------------------------------------------------------------------------- F7: panel

test('tab and shift+tab never leave the open panel', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案')
  await openTree(page, pid)
  await page.getByRole('listitem').filter({ hasText: '写方案' }).click()
  await expect(page.getByRole('dialog')).toBeFocused()

  const inside = () =>
    page.evaluate(() => {
      const a = document.activeElement
      return !!a && !!a.closest('[role="dialog"]')
    })
  const seen = new Set<string>()
  // Far more presses than the panel has controls, so a leak into the page would show.
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    expect(await inside(), `after Tab ${i + 1}`).toBe(true)
    seen.add(
      await page.evaluate(
        () => document.activeElement!.textContent + document.activeElement!.tagName,
      ),
    )
  }
  // It really did walk the panel's controls (not stuck on one).
  expect(seen.size).toBeGreaterThan(5)
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Shift+Tab')
    expect(await inside(), `after Shift+Tab ${i + 1}`).toBe(true)
  }
  // The control the panel used to cover is not the one that gets focus.
  await expect(page.getByRole('button', { name: 'Log out' })).not.toBeFocused()
})

test('a click outside closes the panel, a click inside does not', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案')
  await openTree(page, pid)
  await page.getByRole('listitem').filter({ hasText: '写方案' }).click()
  const dialog = page.getByRole('dialog')

  await page.getByLabel('备注').click()
  await dialog.getByText('标题').click()
  await expect(dialog).toBeVisible()

  await page.mouse.click(60, 600)
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: '任务：写方案', exact: true })).toBeFocused()
})

test('the open panel leaves the top bar usable', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案')
  await openTree(page, pid)
  await page.getByRole('listitem').filter({ hasText: '写方案' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()

  // What is at the centre of each top-bar control is that control, not the panel.
  for (const target of [
    page.getByPlaceholder('捕获…'),
    page.getByRole('button', { name: 'Log out' }),
  ]) {
    const box = (await target.boundingBox())!
    const hit = await target.evaluate((el, p) => document.elementFromPoint(p.x, p.y) === el, {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    })
    expect(hit).toBe(true)
  }
})

test('saving closes the panel, says so on the row, and is on the server', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案')
  await openTree(page, pid)
  await page.getByRole('listitem').filter({ hasText: '写方案' }).click()
  await page.getByLabel('备注').fill('先问清需求')

  const done = page.waitForResponse((r) => isPatch(r) && r.ok())
  await page.getByRole('button', { name: '保存' }).click()
  await done
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(treeRow(page, '写方案').getByRole('status')).toHaveText('已保存')
  await expect(page.getByRole('button', { name: '任务：写方案', exact: true })).toBeFocused()
  // The confirmation is momentary, not a permanent badge.
  await expect(treeRow(page, '写方案').getByRole('status')).toHaveCount(0, { timeout: 6000 })
  const body = await (await page.request.get(`/api/v1/projects/${pid}/tasks`)).json()
  expect(body.tasks[0].notes).toBe('先问清需求')
})

test('saving from the Today panel closes it and confirms on the row', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案', { status: 'in_progress' })
  await page.goto('/')
  await page.getByRole('region', { name: '正在做' }).getByText('写方案').click()
  await page.getByLabel('备注').fill('备注')
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('region', { name: '正在做' }).getByRole('status')).toHaveText(
    '已保存',
  )
})
