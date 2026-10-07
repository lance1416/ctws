import { expect, test, type Page } from '@playwright/test'
import { editDetail, registerFreshUser } from './helpers'

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

/**
 * The row's date control. It replaced the seven inline text links an overdue row used to carry
 * (and the five a carried row carried): the actions are the same actions and send the same
 * requests, but they live inside one disclosure instead of lying on the row.
 *
 * The trigger's name deliberately does not CONTAIN either group name, so `getByRole` -- which
 * matches accessible names by substring -- cannot confuse the two.
 */
const triage = (page: Page, title: string) =>
  page.getByRole('button', { name: `调整「${title}」的日期` })

/** Opens a row's date control and returns the panel, asserting it actually opened. */
async function openTriage(page: Page, title: string, kind: '逾期' | '顺延') {
  await triage(page, title).click()
  const panel = page.getByRole('group', { name: `处理${kind}：${title}` })
  await expect(panel).toBeVisible()
  return panel
}

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
  await expect(page.getByText('今天没有要做的事')).toBeVisible()
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
  await expect(page.getByText('今天没有要做的事')).toBeVisible()
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

test('推迟 on an overdue row moves the deadline, keeps its time of day, and the row leaves 逾期', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const due = dueAgo(2)
  await makeTask(page, pid, '推到明天', { dueAt: due })
  await makeTask(page, pid, '推到下周', { dueAt: due })
  await makeTask(page, pid, '不动的', { dueAt: due })
  await page.goto('/')
  const section = page.getByRole('region', { name: '逾期' })
  await expect(section.getByText('已逾 2 天')).toHaveCount(3)

  // The same local time of day, on another local day.
  const onDay = (days: number) => {
    const d = new Date(due)
    return new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate() + days,
      d.getHours(),
      d.getMinutes(),
      d.getSeconds(),
      d.getMilliseconds(),
    )
  }
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const expectTomorrow = new Date(
    tomorrow.getFullYear(),
    tomorrow.getMonth(),
    tomorrow.getDate(),
    onDay(0).getHours(),
    onDay(0).getMinutes(),
    onDay(0).getSeconds(),
    onDay(0).getMilliseconds(),
  )

  let res = patched(page)
  await (
    await openTriage(page, '推到明天', '逾期')
  )
    .getByRole('button', { name: '推迟到明天' })
    .click()
  // The request moves the deadline and nothing else.
  expect((await res).request().postDataJSON()).toEqual({ dueAt: expectTomorrow.toISOString() })
  // The row left 逾期; the other two overdue rows did not move.
  await expect(page.getByText('推到明天')).toHaveCount(0)
  await expect(section.getByText('已逾 2 天')).toHaveCount(2)
  // The server says so, from a fresh read, in its own segment arithmetic: not on the list at all.
  const today = (await (await page.request.get('/api/v1/today')).json()).tasks as {
    title: string
    segment: string
  }[]
  expect(today.find((t) => t.title === '推到明天')).toBeUndefined()
  expect(
    today
      .filter((t) => t.segment === 'overdue')
      .map((t) => t.title)
      .sort(),
  ).toEqual(['不动的', '推到下周'])
  const moved = await serverTask(page, pid, '推到明天')
  expect(new Date(moved.dueAt!).getTime()).toBe(expectTomorrow.getTime())
  // No scheduling was invented on the way.
  expect(moved.scheduledOn).toBeNull()
  await page.reload()
  await expect(page.getByText('推到明天')).toHaveCount(0)

  // Next week is the coming Monday, at the same time of day.
  const now = new Date()
  const toMonday = (8 - now.getDay()) % 7 || 7
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + toMonday,
    onDay(0).getHours(),
    onDay(0).getMinutes(),
    onDay(0).getSeconds(),
    onDay(0).getMilliseconds(),
  )
  res = patched(page)
  await (
    await openTriage(page, '推到下周', '逾期')
  )
    .getByRole('button', { name: '推迟到下周' })
    .click()
  expect((await res).request().postDataJSON()).toEqual({ dueAt: monday.toISOString() })
  await expect(page.getByText('推到下周')).toHaveCount(0)
  expect(new Date((await serverTask(page, pid, '推到下周')).dueAt!).getTime()).toBe(
    monday.getTime(),
  )
  // The untouched one is still overdue on the server.
  expect(new Date((await serverTask(page, pid, '不动的')).dueAt!).getTime()).toBe(
    new Date(due).getTime(),
  )
  await expect(section.getByText('不动的')).toBeVisible()
})

test('only a deadline change takes a task out of 逾期: a bare scheduledOn does not', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const id = await makeTask(page, pid, '过期了', { dueAt: dueAgo(2) })
  const tomorrow = ymd(new Date(Date.now() + DAY))
  const segmentOf = async () => {
    const tasks = (await (await page.request.get('/api/v1/today')).json()).tasks as {
      id: string
      segment: string
    }[]
    return tasks.find((t) => t.id === id)?.segment ?? 'absent'
  }
  expect(await segmentOf()).toBe('overdue')

  // Scheduling it for tomorrow (what the old 推迟 did) must NOT hide the missed deadline.
  const p = await page.request.patch(`/api/v1/tasks/${id}`, {
    headers: HEADERS,
    data: { scheduledOn: tomorrow },
  })
  expect(p.ok()).toBeTruthy()
  expect((await serverTask(page, pid, '过期了')).scheduledOn).toBe(tomorrow)
  expect(await segmentOf()).toBe('overdue')
  await page.goto('/')
  await expect(page.getByRole('region', { name: '逾期' }).getByText('过期了')).toBeVisible()

  // Whereas moving the deadline itself does take it out.
  const q = await page.request.patch(`/api/v1/tasks/${id}`, {
    headers: HEADERS,
    data: { dueAt: new Date(Date.now() + 3 * DAY).toISOString() },
  })
  expect(q.ok()).toBeTruthy()
  expect(await segmentOf()).not.toBe('overdue')
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
  await (
    await openTriage(page, '不再重要', '逾期')
  )
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
  // Exactly one date control on the page: the overdue row has one, the in-progress row has none.
  await expect(page.locator('[data-triage-trigger]')).toHaveCount(1)
  await expect(triage(page, '逾期的')).toBeVisible()
  await expect(triage(page, '在做的')).toHaveCount(0)

  // Opening it offers the same two exits it always did, and nothing is reachable while it is shut.
  await expect(page.getByRole('button', { name: '推迟到明天' })).toHaveCount(0)
  const panel = await openTriage(page, '逾期的', '逾期')
  await expect(panel.getByRole('button', { name: '推迟到明天' })).toBeVisible()
  await expect(panel.getByRole('button', { name: '推迟到下周' })).toBeVisible()
  await expect(panel.getByRole('button', { name: '取消截止' })).toBeVisible()
  // Escape shuts it and hands focus back to the trigger rather than to <body> (WCAG 2.4.3).
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(triage(page, '逾期的')).toBeFocused()

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
  // Taken ONCE and reused below: deriving the expected wording from a second `dueAgo(5)` call
  // would read the clock twice, and a minute tick between the two makes the test red for a minute.
  const lateDue = dueAgo(5)
  await makeTask(page, pid, '逾期的', { dueAt: lateDue })
  await makeTask(page, pid, '今天截止', { dueAt: todayLate.toISOString() })
  await makeTask(page, pid, '只排期', { scheduledOn: ymd(new Date(now.getTime() + DAY)) })
  await makeTask(page, pid, '没日期')
  await makeTask(page, pid, '已完成逾期', { dueAt: dueAgo(9), status: 'done' })
  await openTree(page, pid)

  const hints = (title: string) => treeRow(page, title).locator('[data-date-hint]')
  // The second line now carries the WHOLE wording (rows-and-reading §2, second edition): an
  // overdue row says which deadline it was and when, to the minute, as well as how late it is. The
  // previous edition showed only 「已逾 5 天」 because the label had to fit an 8rem cell.
  const line = (title: string) => treeRow(page, title).locator('[data-row-meta]')
  const d = new Date(lateDue)
  const clock = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  await expect(line('逾期的')).toHaveText(
    `${d.getMonth() + 1}月${d.getDate()}日 ${clock} 截止·已逾 5 天`,
  )
  await expect(hints('逾期的')).toHaveAttribute('data-date-hint', 'overdue')
  await expect(hints('今天截止')).toHaveText('今天 23:30 截止')
  await expect(hints('今天截止')).toHaveAttribute('data-date-hint', 'due')
  await expect(hints('只排期')).toHaveText('排到明天')
  // A dateless row and a finished row carry no date at all: the row is still a row.
  await expect(hints('没日期')).toHaveCount(0)
  await expect(hints('已完成逾期')).toHaveCount(0)

  // Overdue is told apart by its words, not by its colour: the same row without the colour
  // class would still read "已逾 5 天", and the due-today row never says it.
  await expect(line('逾期的')).toContainText('已逾 5 天')
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

// The detail panel is an OVERLAY only below 1280px (design plan section 4); at or above that
// width it is a coexisting third column, where a scrim, a click-outside and a focus trap would
// all be wrong -- the whole point is that the list beside it stays usable. These three tests are
// about the overlay, so they run at a width where it is one. The pane's own contract (no
// backdrop, Tab leaves it, a click on the list is a click on the list) is pinned in
// workbench.spec.ts, so neither half of the rule rests on the default viewport happening to be
// 1280.
const OVERLAY_VIEWPORT = { width: 1024, height: 800 }

test.describe('the panel as an overlay', () => {
  test.use({ viewport: OVERLAY_VIEWPORT })

  test('closing a panel with unsaved edits asks; keep editing keeps them, discard drops them', async ({
    page,
  }) => {
    await registerFreshUser(page)
    const pid = await makeProject(page, 'P')
    await makeTask(page, pid, '写方案')
    await openTree(page, pid)
    await page.getByRole('listitem').filter({ hasText: '写方案' }).click()
    await editDetail(page)
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
    await editDetail(page)
    await expect(page.getByLabel('标题')).toHaveValue('写方案')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })

  /**
   * A NAMED DAY PRESSED IS AN UNSAVED EDIT. The three date decisions (今天 / 明天 / 下周 and the
   * two ways out) do not type into a field, so whatever the form holds has to be told that they
   * changed something. A mutation proved this needed its own guard: dropping the flag that says so
   * left the form clean, which the existing cases caught only as a MISSING request -- the person
   * would have walked away from a press that silently did nothing, with no prompt at all.
   */
  test('a named date decision counts as an unsaved edit, with nothing typed', async ({ page }) => {
    await registerFreshUser(page)
    const pid = await makeProject(page, 'P')
    await makeTask(page, pid, '写方案')
    await openTree(page, pid)
    await page.getByRole('listitem').filter({ hasText: '写方案' }).click()
    await editDetail(page)
    const dialog = page.getByRole('dialog')

    // Not a keystroke in the panel: one press on 明天截止, which writes the deadline field.
    await page.getByRole('button', { name: '明天截止' }).click()
    await expect(page.getByLabel('截止', { exact: true })).not.toHaveValue('')
    await page.getByRole('button', { name: '关闭' }).click()
    await expect(dialog).toContainText('有未保存的修改')
    await page.getByRole('button', { name: '继续编辑' }).click()

    // The plan half of the same control, and the ways OUT of a date are edits too: 清除排期 on a
    // task that has a plan removes it, so leaving would lose that.
    await page.getByRole('button', { name: '排到今天' }).click()
    await page.getByRole('button', { name: '清除排期' }).click()
    // Back to what it was (no plan), so there is nothing to lose and nothing to ask about -- the
    // deadline press above is what still makes it dirty.
    await expect(page.getByLabel('排期')).toHaveValue('')
    await page.getByRole('button', { name: '取消截止' }).click()
    await page.getByRole('button', { name: '关闭' }).click()
    await expect(dialog).toHaveCount(0)
    expect((await serverTask(page, pid, '写方案')).dueAt).toBeNull()
  })

  // -------------------------------------------------------------------------------------- F7: panel

  test('tab and shift+tab never leave the open panel', async ({ page }) => {
    await registerFreshUser(page)
    const pid = await makeProject(page, 'P')
    await makeTask(page, pid, '写方案')
    await openTree(page, pid)
    await page.getByRole('listitem').filter({ hasText: '写方案' }).click()
    await editDetail(page)
    // Focus is inside the panel to start with. (That it lands on the PANEL when the pane first
    // opens is pinned in detail.spec.ts; 编辑 hands it to the first field instead, which is
    // pinned in pane.spec.ts. What this test is about is that it never gets out.)
    await expect(page.getByRole('textbox', { name: '标题' })).toBeFocused()

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
    await editDetail(page)
    const dialog = page.getByRole('dialog')

    await page.getByLabel('备注', { exact: true }).click()
    // A click on a non-interactive part of the panel. The panel no longer prints the word 标题
    // over the title (it opens with the task itself), so this presses the 备注 label instead --
    // still a dead area of the panel, which is the whole point of the assertion.
    await dialog.getByText('备注').click()
    await expect(dialog).toBeVisible()

    await page.mouse.click(60, 600)
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('button', { name: '任务：写方案', exact: true })).toBeFocused()
  })
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
  await editDetail(page)
  await page.getByLabel('备注', { exact: true }).fill('先问清需求')

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
  await editDetail(page)
  await page.getByLabel('备注', { exact: true }).fill('备注')
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('region', { name: '正在做' }).getByRole('status')).toHaveText(
    '已保存',
  )
})

// ------------------------------------------------------------------ plan side: carried plans

const dayOffset = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return ymd(d)
}
const nextMondayYmd = () => {
  const d = new Date()
  d.setDate(d.getDate() + (d.getDay() === 0 ? 1 : 8 - d.getDay()))
  return ymd(d)
}
const rowOf = (page: Page, title: string) =>
  page
    .locator('li')
    .filter({ has: page.locator('[data-today-row]') })
    .filter({ hasText: title })
async function todaySegment(page: Page, id: string): Promise<string> {
  const tasks = (await (await page.request.get('/api/v1/today')).json()).tasks as {
    id: string
    segment: string
  }[]
  return tasks.find((t) => t.id === id)?.segment ?? 'absent'
}

test('a plan carried over from days ago is marked in 今天 with its day; a plan for today is not', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const old = dayOffset(-5)
  await makeTask(page, pid, '搁置的计划', { scheduledOn: old })
  await makeTask(page, pid, '昨天的计划', { scheduledOn: dayOffset(-1) })
  await makeTask(page, pid, '今天的计划', { scheduledOn: dayOffset(0) })
  await page.goto('/')
  const section = page.getByRole('region', { name: '今天', exact: true })
  await expect(section.getByText('今天的计划')).toBeVisible()

  const [, m, d] = old.split('-').map(Number)
  await expect(rowOf(page, '搁置的计划').locator('[data-date-hint="carried"]')).toHaveText(
    `原定${m}月${d}日，已顺延`,
  )
  await expect(rowOf(page, '昨天的计划').locator('[data-date-hint="carried"]')).toHaveText(
    '原定昨天，已顺延',
  )
  // Today's own plan carries no mark and no triage group.
  await expect(rowOf(page, '今天的计划').locator('[data-date-hint]')).toHaveCount(0)
  await expect(triage(page, '今天的计划')).toHaveCount(0)
  await expect(page.locator('[data-date-hint="carried"]')).toHaveCount(2)
  // Not an overdue deadline: no overdue segment, no overdue wording.
  await expect(page.getByRole('region', { name: '逾期' })).toHaveCount(0)
  await expect(section).not.toContainText('已逾')
})

test('改到今天 keeps the row, drops the mark, and changes only the plan', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const id = await makeTask(page, pid, '改到今天的', { scheduledOn: dayOffset(-3) })
  await makeTask(page, pid, '旁观者', { scheduledOn: dayOffset(-3) })
  await page.goto('/')
  const res = patched(page)
  await (
    await openTriage(page, '改到今天的', '顺延')
  )
    .getByRole('button', { name: '改到今天' })
    .click()
  expect((await res).request().postDataJSON()).toEqual({ scheduledOn: dayOffset(0) })

  // The row stays but is no longer carried, so its date control goes with the mark.
  await expect(triage(page, '改到今天的')).toHaveCount(0)
  await expect(rowOf(page, '改到今天的').locator('[data-date-hint="carried"]')).toHaveCount(0)
  await expect(
    page.getByRole('region', { name: '今天', exact: true }).getByText('改到今天的'),
  ).toBeVisible()
  // The neighbour is untouched and still marked.
  await expect(triage(page, '旁观者')).toBeVisible()
  expect((await serverTask(page, pid, '改到今天的')).scheduledOn).toBe(dayOffset(0))
  expect((await serverTask(page, pid, '旁观者')).scheduledOn).toBe(dayOffset(-3))
  expect(await todaySegment(page, id)).toBe('today')
  await page.reload()
  await expect(page.getByText('改到今天的')).toBeVisible()
  await expect(triage(page, '改到今天的')).toHaveCount(0)
})

test('改到明天 and 改到下周 move the plan and the row leaves 今天', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const a = await makeTask(page, pid, '改到明天的', { scheduledOn: dayOffset(-2) })
  const b = await makeTask(page, pid, '改到下周的', { scheduledOn: dayOffset(-2) })
  await makeTask(page, pid, '留着的', { scheduledOn: dayOffset(-2) })
  await page.goto('/')

  let res = patched(page)
  await (
    await openTriage(page, '改到明天的', '顺延')
  )
    .getByRole('button', { name: '改到明天' })
    .click()
  expect((await res).request().postDataJSON()).toEqual({ scheduledOn: dayOffset(1) })
  await expect(page.getByText('改到明天的')).toHaveCount(0)
  expect((await serverTask(page, pid, '改到明天的')).scheduledOn).toBe(dayOffset(1))
  expect(await todaySegment(page, a)).toBe('absent')

  res = patched(page)
  await (
    await openTriage(page, '改到下周的', '顺延')
  )
    .getByRole('button', { name: '改到下周' })
    .click()
  expect((await res).request().postDataJSON()).toEqual({ scheduledOn: nextMondayYmd() })
  await expect(page.getByText('改到下周的')).toHaveCount(0)
  expect((await serverTask(page, pid, '改到下周的')).scheduledOn).toBe(nextMondayYmd())
  expect(await todaySegment(page, b)).toBe('absent')

  // The one nobody touched is still there and still carried.
  await expect(triage(page, '留着的')).toBeVisible()
  await expect(rowOf(page, '留着的').locator('[data-date-hint="carried"]')).toBeVisible()
  await expect(page.locator('[data-today-row]')).toHaveCount(1)
  await page.reload()
  await expect(page.locator('[data-today-row]')).toHaveCount(1)
})

test('清除排期 removes the row from 今天 and the server holds no plan', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const id = await makeTask(page, pid, '不排了', { scheduledOn: dayOffset(-4) })
  await makeTask(page, pid, '另一个', { scheduledOn: dayOffset(-4) })
  await page.goto('/')
  const res = patched(page)
  await (await openTriage(page, '不排了', '顺延')).getByRole('button', { name: '清除排期' }).click()
  expect((await res).request().postDataJSON()).toEqual({ scheduledOn: null })
  await expect(page.getByText('不排了')).toHaveCount(0)

  const t = await serverTask(page, pid, '不排了')
  expect(t.scheduledOn).toBeNull()
  expect(t.status).toBe('backlog') // the task still exists, untouched: only the plan went
  expect(await todaySegment(page, id)).toBe('absent')
  await page.reload()
  await expect(page.getByText('不排了')).toHaveCount(0)
  await expect(page.getByText('另一个')).toBeVisible()
})

test('a carried plan is not a deadline: clearing the plan leaves dueAt alone', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const due = new Date()
  due.setHours(23, 0, 0, 0)
  await makeTask(page, pid, '计划和今晚截止', {
    scheduledOn: dayOffset(-2),
    dueAt: due.toISOString(),
  })
  await page.goto('/')
  await expect(triage(page, '计划和今晚截止')).toBeVisible()
  const res = patched(page)
  await (
    await openTriage(page, '计划和今晚截止', '顺延')
  )
    .getByRole('button', { name: '清除排期' })
    .click()
  await res
  const t = await serverTask(page, pid, '计划和今晚截止')
  expect(t.scheduledOn).toBeNull()
  expect(new Date(t.dueAt!).getTime()).toBe(due.getTime())
  // It is still due today, so it stays on the list, no longer marked.
  await expect(page.getByText('计划和今晚截止')).toBeVisible()
  await expect(triage(page, '计划和今晚截止')).toHaveCount(0)
})

test('转为排期 turns an overdue deadline into a plan: out of 逾期, into 今天, dueAt gone', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const id = await makeTask(page, pid, '没人在等', { dueAt: dueAgo(3) })
  await makeTask(page, pid, '转到明天', { dueAt: dueAgo(3) })
  await makeTask(page, pid, '还逾期', { dueAt: dueAgo(3) })
  await page.goto('/')
  const overdue = page.getByRole('region', { name: '逾期' })
  await expect(overdue.getByText('已逾 3 天')).toHaveCount(3)
  expect(await todaySegment(page, id)).toBe('overdue')

  let res = patched(page)
  await (
    await openTriage(page, '没人在等', '逾期')
  )
    .getByRole('button', { name: '今天', exact: true })
    .click()
  // One request carries both halves of the change.
  expect((await res).request().postDataJSON()).toEqual({ dueAt: null, scheduledOn: dayOffset(0) })

  await expect(overdue.getByText('没人在等')).toHaveCount(0)
  await expect(
    page.getByRole('region', { name: '今天', exact: true }).getByText('没人在等'),
  ).toBeVisible()
  const t = await serverTask(page, pid, '没人在等')
  expect(t.dueAt).toBeNull()
  expect(t.scheduledOn).toBe(dayOffset(0))
  expect(await todaySegment(page, id)).toBe('today')
  // A plan for today is quiet: no carried mark and no date control.
  await expect(triage(page, '没人在等')).toHaveCount(0)
  await expect(rowOf(page, '没人在等').locator('[data-date-hint]')).toHaveCount(0)
  await page.reload()
  await expect(
    page.getByRole('region', { name: '今天', exact: true }).getByText('没人在等'),
  ).toBeVisible()

  // Demoting to tomorrow leaves the list altogether; the neighbour stays overdue.
  res = patched(page)
  await (
    await openTriage(page, '转到明天', '逾期')
  )
    .getByRole('button', { name: '明天', exact: true })
    .click()
  expect((await res).request().postDataJSON()).toEqual({ dueAt: null, scheduledOn: dayOffset(1) })
  await expect(page.getByText('转到明天')).toHaveCount(0)
  const t2 = await serverTask(page, pid, '转到明天')
  expect(t2.dueAt).toBeNull()
  expect(t2.scheduledOn).toBe(dayOffset(1))
  expect(new Date((await serverTask(page, pid, '还逾期')).dueAt!).getTime()).toBeLessThan(
    Date.now(),
  )
  await expect(overdue.getByText('还逾期')).toBeVisible()
})

test('the plan actions are not offered on an overdue row or on a plan for today', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '逾期兼旧计划', { dueAt: dueAgo(2), scheduledOn: dayOffset(-3) })
  await makeTask(page, pid, '今天计划', { scheduledOn: dayOffset(0) })
  await page.goto('/')
  await expect(page.getByText('今天计划')).toBeVisible()
  // A plan for today needs no triage at all, so that row has no date control.
  await expect(triage(page, '今天计划')).toHaveCount(0)
  // The overdue row has one, and it offers the DEADLINE exits only: a task whose deadline has
  // gone is not triaged by nudging the plan it also happens to carry.
  const panel = await openTriage(page, '逾期兼旧计划', '逾期')
  await expect(panel.getByRole('button', { name: '推迟到明天' })).toBeVisible()
  await expect(panel.getByRole('button', { name: '改到今天' })).toHaveCount(0)
  await expect(panel.getByRole('button', { name: '清除排期' })).toHaveCount(0)
  await expect(page.getByRole('group', { name: '处理顺延：逾期兼旧计划' })).toHaveCount(0)
  // 逾期 is a one-third-width SUMMARY, so its row says how late and no longer lists the plan or the
  // deadline's timestamp (rows-and-reading §2, per-surface). The carried plan is not gone: it is
  // read from the detail pane, which is where this test now looks for it.
  await page.keyboard.press('Escape')
  await expect(rowOf(page, '逾期兼旧计划').locator('[data-late-text]')).toBeVisible()
  await expect(rowOf(page, '逾期兼旧计划').locator('[data-date-hint="scheduled"]')).toHaveCount(0)
  await rowOf(page, '逾期兼旧计划').locator('[data-today-row]').click()
  const planLine = page
    .locator('div')
    .filter({ has: page.getByText('排期', { exact: true }) })
    .last()
  await expect(planLine).not.toContainText('没有设定')
  await expect(planLine).toContainText(`${Number(dayOffset(-3).slice(5, 7))}月`)
})
