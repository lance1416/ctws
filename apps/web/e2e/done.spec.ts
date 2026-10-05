import { expect, test, type Page } from '@playwright/test'
import { backdateCompletion, registerFreshUser } from './helpers'

// The completed-work view, task deletion, and the panel's guard against losing edits on
// navigation. As in daily.spec.ts, every claim about what changed is checked against the SERVER
// (a fresh GET) or a reload, so an implementation that only updates the screen cannot pass.

const HEADERS = { 'x-ctws-client': 'web' }

type ApiTask = { id: string; title: string; status: string }

async function makeProject(page: Page, name: string): Promise<string> {
  const res = await page.request.post('/api/v1/projects', { headers: HEADERS, data: { name } })
  expect(res.ok()).toBeTruthy()
  return ((await res.json()) as { id: string }).id
}

async function makeTask(
  page: Page,
  projectId: string,
  title: string,
  opts: { parentId?: string; patch?: Record<string, unknown> } = {},
): Promise<string> {
  const res = await page.request.post('/api/v1/tasks', {
    headers: HEADERS,
    data: { projectId, title, parentId: opts.parentId ?? null },
  })
  expect(res.ok()).toBeTruthy()
  const id = ((await res.json()) as { id: string }).id
  if (opts.patch) {
    const p = await page.request.patch(`/api/v1/tasks/${id}`, {
      headers: HEADERS,
      data: opts.patch,
    })
    expect(p.ok()).toBeTruthy()
  }
  return id
}

/** Finishes a task through the API, then (optionally) moves the completion back in time. */
async function finish(page: Page, id: string, ago?: string) {
  const p = await page.request.patch(`/api/v1/tasks/${id}`, {
    headers: HEADERS,
    data: { status: 'done' },
  })
  expect(p.ok()).toBeTruthy()
  if (ago) backdateCompletion(id, ago)
}

const serverTasks = async (page: Page, projectId: string): Promise<ApiTask[]> =>
  (await (await page.request.get(`/api/v1/projects/${projectId}/tasks`)).json()).tasks

const nav = (page: Page) => page.getByRole('navigation', { name: '主导航' })

const goCompleted = async (page: Page) => {
  await nav(page).getByRole('link', { name: '已完成' }).click()
  await expect(page.getByRole('heading', { name: '已完成', level: 1 })).toBeVisible()
}

const rowsIn = (page: Page, section: string | RegExp) =>
  page.getByRole('region', { name: section }).getByRole('listitem')

const isTaskPatch = (r: { url: () => string; request: () => { method: () => string } }) =>
  r.request().method() === 'PATCH' && /\/tasks\/[^/]+$/.test(r.url())

// ------------------------------------------------------------------------- the completed view

test('finishing a task in the tree puts it on 已完成 with its project and parent, across projects', async ({
  page,
}) => {
  await registerFreshUser(page)
  const alpha = await makeProject(page, 'Alpha')
  const beta = await makeProject(page, 'Beta')
  const parent = await makeTask(page, alpha, '发布')
  await makeTask(page, alpha, '写文档', { parentId: parent })
  await makeTask(page, beta, '修 bug')
  await makeTask(page, beta, '还没做')
  await makeTask(page, beta, '放弃了', { patch: { status: 'cancelled' } })

  // Finish one task in each project, through the UI, the older one first.
  for (const [pid, title] of [
    [alpha, '写文档'],
    [beta, '修 bug'],
  ] as const) {
    await page.goto(`/projects/${pid}`)
    await page.getByRole('listitem').first().waitFor()
    const saved = page.waitForResponse((r) => isTaskPatch(r) && r.ok())
    await page.getByRole('button', { name: `完成「${title}」` }).click()
    await saved
    // Distinct instants: the order below must come from the clock, not from creation order.
    await page.waitForTimeout(50)
  }

  await goCompleted(page)
  const rows = rowsIn(page, /^今天 · /)
  // Newest first, across both projects, each under its project (and parent, when it has one).
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('修 bug')
  await expect(rows.nth(0)).toContainText('Beta')
  await expect(rows.nth(0)).not.toContainText('›')
  await expect(rows.nth(1)).toContainText('写文档')
  await expect(rows.nth(1)).toContainText('Alpha › 发布')
  // Open work and cancelled work are not "done": neither is listed.
  await expect(page.getByText('还没做')).toHaveCount(0)
  await expect(page.getByText('放弃了')).toHaveCount(0)

  // A reload shows the same, from the server.
  await page.reload()
  await expect(rowsIn(page, /^今天 · /)).toHaveCount(2)
  await expect(rowsIn(page, /^今天 · /).first()).toContainText('修 bug')
})

test('the completed list is grouped by day, newest day and newest task first', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'History')
  const nowTask = await makeTask(page, pid, '刚刚完成')
  const yesterday = await makeTask(page, pid, '昨天完成')
  const olderA = await makeTask(page, pid, '五天前上午')
  const olderB = await makeTask(page, pid, '五天前晚上')
  await finish(page, nowTask)
  await finish(page, yesterday, '25 hours')
  // Same day, six hours apart: the later one must come first within the day.
  await finish(page, olderA, `${5 * 24 + 8} hours`)
  await finish(page, olderB, `${5 * 24 + 2} hours`)

  await page.goto('/completed')
  const headings = page.getByRole('heading', { level: 2 })
  // Three days, newest first; the nearest two are told apart as 今天 / 昨天.
  await expect(headings).toHaveCount(3)
  await expect(headings.nth(0)).toContainText('今天')
  await expect(headings.nth(1)).toContainText('昨天')
  const five = new Date(Date.now() - (5 * 24 + 5) * 3_600_000)
  const fiveLabel = `${five.getMonth() + 1}月${five.getDate()}日`
  await expect(headings.nth(2)).toContainText(fiveLabel)
  await expect(headings.nth(2)).not.toContainText('今天')
  await expect(headings.nth(2)).not.toContainText('昨天')

  await expect(rowsIn(page, /^今天 · /)).toHaveCount(1)
  await expect(rowsIn(page, /^昨天 · /)).toHaveCount(1)
  const old = rowsIn(page, new RegExp(`^${fiveLabel}`))
  await expect(old).toHaveCount(2)
  await expect(old.nth(0)).toContainText('五天前晚上')
  await expect(old.nth(1)).toContainText('五天前上午')

  // Every row carries a time of day.
  await expect(page.locator('time').first()).toHaveText(/^\d{2}:\d{2}$/)
})

test('a finished task can be restored from the completed list, and the server agrees', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const wrong = await makeTask(page, pid, '点错了')
  const right = await makeTask(page, pid, '真完成了')
  await finish(page, wrong)
  await finish(page, right)

  await page.goto('/completed')
  await expect(page.getByRole('listitem')).toHaveCount(2)
  const restored = page.waitForResponse((r) => isTaskPatch(r) && r.ok())
  await page.getByRole('button', { name: '恢复「点错了」' }).click()
  expect((await restored).request().postDataJSON()).toEqual({ status: 'backlog' })
  await expect(page.getByText('点错了')).toHaveCount(0)
  await expect(page.getByText('真完成了')).toBeVisible()
  // Focus did not fall to <body>.
  await expect(page.getByRole('heading', { name: '已完成', level: 1 })).toBeFocused()

  expect((await serverTasks(page, pid)).find((t) => t.title === '点错了')!.status).toBe('backlog')
  await page.reload()
  await expect(page.getByText('点错了')).toHaveCount(0)
  await expect(page.getByText('真完成了')).toBeVisible()
})

test('with nothing finished, the view says so', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/completed')
  await expect(page.getByText('还没有完成的任务')).toBeVisible()
})

// ------------------------------------------------------------------------------ task deletion

async function openPanel(page: Page, title: string) {
  await page.getByRole('listitem').filter({ hasText: title }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

test('deleting a parent states how many descendants go, cancel deletes nothing, confirm deletes all', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const root = await makeTask(page, pid, '大块')
  const kid1 = await makeTask(page, pid, '子一', { parentId: root })
  await makeTask(page, pid, '子二', { parentId: root })
  await makeTask(page, pid, '孙一', { parentId: kid1 })
  await makeTask(page, pid, '旁观者')
  await page.goto(`/projects/${pid}`)
  await page.getByRole('listitem').first().waitFor()

  const deletes: string[] = []
  page.on('request', (r) => r.method() === 'DELETE' && deletes.push(r.url()))

  await openPanel(page, '大块')
  await page.getByRole('button', { name: '删除任务' }).click()
  const ask = page.getByRole('alertdialog', { name: '确认删除任务' })
  // Two children and one grandchild: three, not two (direct children only) and not four.
  await expect(ask).toContainText('删除「大块」及其 3 条子任务，无法恢复。')
  expect(deletes).toHaveLength(0) // the first click only asks

  // Cancel: nothing was deleted, on the server or on the screen, and the panel is still there.
  await ask.getByRole('button', { name: '取消' }).click()
  await expect(ask).toHaveCount(0)
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('button', { name: '删除任务' })).toBeFocused()
  await page.waitForTimeout(200)
  expect(deletes).toHaveLength(0)
  expect((await serverTasks(page, pid)).map((t) => t.title).sort()).toEqual(
    ['大块', '子一', '子二', '孙一', '旁观者'].sort(),
  )

  // Escape is also "no", and it cancels the question rather than closing the panel.
  await page.getByRole('button', { name: '删除任务' }).click()
  await expect(ask).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(ask).toHaveCount(0)
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(deletes).toHaveLength(0)
  expect(await serverTasks(page, pid)).toHaveLength(5)

  // Confirm: the whole subtree is gone on the server, the bystander is not.
  await page.getByRole('button', { name: '删除任务' }).click()
  await ask.getByRole('button', { name: '确认删除' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(deletes).toHaveLength(1)
  expect((await serverTasks(page, pid)).map((t) => t.title)).toEqual(['旁观者'])
  await page.reload()
  await expect(page.getByRole('listitem')).toHaveCount(1)
  await expect(page.getByText('旁观者')).toBeVisible()
  await expect(page.getByText('大块')).toHaveCount(0)
})

test('deleting a leaf does not claim descendants, and works from the Today panel', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '在做的', { patch: { status: 'in_progress' } })
  await makeTask(page, pid, '另一个', { patch: { status: 'in_progress' } })
  await page.goto('/')
  await expect(page.locator('[data-today-row]')).toHaveCount(2)

  await page.locator('[data-today-row]').filter({ hasText: '在做的' }).click()
  await page.getByRole('button', { name: '删除任务' }).click()
  const ask = page.getByRole('alertdialog', { name: '确认删除任务' })
  await expect(ask).toContainText('删除「在做的」，无法恢复。')
  await expect(ask).not.toContainText('子任务')
  await ask.getByRole('button', { name: '确认删除' }).click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('在做的')).toHaveCount(0)
  await expect(page.getByText('另一个')).toBeVisible()
  expect((await serverTasks(page, pid)).map((t) => t.title)).toEqual(['另一个'])
  const today = (await (await page.request.get('/api/v1/today')).json()).tasks as {
    title: string
  }[]
  expect(today.map((t) => t.title)).toEqual(['另一个'])
})

// ------------------------------------------------------- the panel and navigation (lost edits)

test('navigating away from a dirty panel asks first; keep editing stays, discard leaves', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案')
  await page.goto('/projects')
  // Scoped to <main>: the left rail lists every project by name too.
  await page.getByRole('main').getByRole('link', { name: 'P', exact: true }).click()
  await page.getByRole('listitem').first().waitFor()
  await openPanel(page, '写方案')
  await page.getByLabel('标题').fill('写方案 v2')

  await nav(page).getByRole('link', { name: '今天' }).click()
  // Still here: same page, panel open, the typing intact, and it says why.
  await expect(page).toHaveURL(new RegExp(`/projects/${pid}$`))
  await expect(page.getByRole('dialog')).toContainText('有未保存的修改，离开会丢掉它们')
  await expect(page.getByLabel('标题')).toHaveValue('写方案 v2')

  await page.getByRole('button', { name: '继续编辑' }).click()
  await expect(page.getByRole('dialog').getByText('有未保存的修改')).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`/projects/${pid}$`))
  await expect(page.getByLabel('标题')).toHaveValue('写方案 v2')

  // The browser's back button is a navigation too.
  await page.goBack()
  await expect(page.getByRole('dialog')).toContainText('有未保存的修改，离开会丢掉它们')
  await expect(page).toHaveURL(new RegExp(`/projects/${pid}$`))
  await page.getByRole('button', { name: '继续编辑' }).click()

  await nav(page).getByRole('link', { name: '已完成' }).click()
  await page.getByRole('button', { name: '放弃修改' }).click()
  await expect(page).toHaveURL(/\/tasks\/completed$/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect((await serverTasks(page, pid))[0]!.title).toBe('写方案')
})

test('a clean panel does not stop navigation', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案')
  await page.goto(`/projects/${pid}`)
  await page.getByRole('listitem').first().waitFor()
  await openPanel(page, '写方案')
  await page.getByLabel('标题').fill('写方案 v2')
  await page.getByLabel('标题').fill('写方案') // back to what it was: not dirty
  await nav(page).getByRole('link', { name: '项目' }).click()
  await expect(page).toHaveURL(/\/projects$/)
})

test('Log out with a dirty panel asks first and does not log out until discarded', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案')
  await page.goto(`/projects/${pid}`)
  await page.getByRole('listitem').first().waitFor()
  await openPanel(page, '写方案')
  await page.getByLabel('标题').fill('写方案 v2')

  const logouts: string[] = []
  page.on('request', (r) => r.url().endsWith('/auth/logout') && logouts.push(r.url()))
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByRole('dialog')).toContainText('有未保存的修改，离开会丢掉它们')
  await expect(page.getByLabel('标题')).toHaveValue('写方案 v2')
  await expect(page.getByTestId('current-user')).toBeVisible()
  await page.waitForTimeout(300)
  expect(logouts).toHaveLength(0) // no logout request was sent
  // Still signed in on the server.
  expect((await page.request.get('/api/v1/auth/me')).ok()).toBeTruthy()

  await page.getByRole('button', { name: '继续编辑' }).click()
  await expect(page.getByLabel('标题')).toHaveValue('写方案 v2')

  await page.getByRole('button', { name: 'Log out' }).click()
  await page.getByRole('button', { name: '放弃修改' }).click()
  await expect(page.getByLabel('Email')).toBeVisible()
  expect(logouts).toHaveLength(1)
  expect((await page.request.get('/api/v1/auth/me')).ok()).toBeFalsy()
})

test('pressing Save and then a nav link at once is not mistaken for losing edits', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案')
  await page.goto(`/projects/${pid}`)
  await page.getByRole('listitem').first().waitFor()
  await openPanel(page, '写方案')
  await page.getByLabel('标题').fill('写方案 v2')

  // Hold the save in flight, so "click Save, then a link" is deterministic rather than a race.
  await page.route('**/api/v1/tasks/*', async (route) => {
    if (route.request().method() === 'PATCH') await new Promise((r) => setTimeout(r, 800))
    await route.continue()
  })
  await page.getByRole('button', { name: '保存' }).click()
  await nav(page).getByRole('link', { name: '今天' }).click()
  await expect(page).toHaveURL(/\/tasks\/today$/)
  await expect(page.getByText('有未保存的修改')).toHaveCount(0)
  // The save was not lost on the way.
  await expect
    .poll(async () => (await serverTasks(page, pid))[0]!.title, { timeout: 5000 })
    .toBe('写方案 v2')
})
