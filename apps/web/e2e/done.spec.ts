import { expect, test, type Page } from '@playwright/test'
import {
  backdateCompletion,
  editDetail,
  logOut,
  makeProject,
  makeTask,
  registerFreshUser,
  WEB,
} from './helpers'

/** The month names the app prints, so a spec can build the string the page will show. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// The completed-work view, task deletion, and the panel's guard against losing edits on
// navigation. As in daily.spec.ts, every claim about what changed is checked against the SERVER
// (a fresh GET) or a reload, so an implementation that only updates the screen cannot pass.

type ApiTask = { id: string; title: string; status: string }

/**
 * Hours to go back so a completion lands around NOON on the day `daysAgo` before today.
 *
 * A fixed offset cannot express "yesterday": run at 23:30, `25 hours` lands on yesterday; run at
 * 00:30 it lands the day BEFORE yesterday, and the heading reads a date instead of "Yesterday".
 * No single constant works for both, so the offset is measured from the current local hour --
 * otherwise the test is red for one hour out of every twenty-four.
 */
function hoursBackToNoon(daysAgo: number): number {
  return new Date().getHours() + 12 + (daysAgo - 1) * 24
}

/** Finishes a task through the API, then (optionally) moves the completion back in time. */
async function finish(page: Page, id: string, ago?: string) {
  const p = await page.request.patch(`/api/v1/tasks/${id}`, {
    headers: WEB,
    data: { status: 'done' },
  })
  expect(p.ok()).toBeTruthy()
  if (ago) backdateCompletion(id, ago)
}

const serverTasks = async (page: Page, projectId: string): Promise<ApiTask[]> =>
  (await (await page.request.get(`/api/v1/tasks?projectId=${projectId}`)).json()).tasks

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' })

/**
 * Done is a VIEW of Review, not a rail row of its own: both answer what I did.
 */
const goCompleted = async (page: Page) => {
  await nav(page).getByRole('link', { name: 'Review' }).click()
  await page.getByRole('tab', { name: 'Done' }).click()
  await expect(page.getByRole('tab', { name: 'Done' })).toHaveAttribute('aria-selected', 'true')
}

const rowsIn = (page: Page, section: string | RegExp) =>
  page.getByRole('region', { name: section }).getByRole('listitem')

const isTaskPatch = (r: { url: () => string; request: () => { method: () => string } }) =>
  r.request().method() === 'PATCH' && /\/tasks\/[^/]+$/.test(r.url())

// ------------------------------------------------------------------------- the completed view

test('finishing a task in the tree puts it on Done with its project and parent, across projects', async ({
  page,
}) => {
  await registerFreshUser(page)
  const alpha = await makeProject(page, 'Alpha')
  const beta = await makeProject(page, 'Beta')
  const parent = await makeTask(page, alpha, '发布')
  await makeTask(page, alpha, '写文档', {}, parent)
  await makeTask(page, beta, '修 bug')
  await makeTask(page, beta, '还没做')
  await makeTask(page, beta, '放弃了', { status: 'cancelled' })

  // Finish one task in each project, through the UI, the older one first.
  for (const [pid, title] of [
    [alpha, '写文档'],
    [beta, '修 bug'],
  ] as const) {
    await page.goto(`/projects/${pid}`)
    await page.getByRole('listitem').first().waitFor()
    const saved = page.waitForResponse((r) => isTaskPatch(r) && r.ok())
    await page.getByRole('button', { name: `Complete “${title}”` }).click()
    await saved
    // Distinct instants: the order below must come from the clock, not from creation order.
    await page.waitForTimeout(50)
  }

  await goCompleted(page)
  const rows = rowsIn(page, /^Today · /)
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
  await expect(rowsIn(page, /^Today · /)).toHaveCount(2)
  await expect(rowsIn(page, /^Today · /).first()).toContainText('修 bug')
})

test('the completed list is grouped by day, newest day and newest task first', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'History')
  const nowTask = await makeTask(page, pid, '刚刚完成')
  const yesterday = await makeTask(page, pid, '昨天完成')
  const olderA = await makeTask(page, pid, '五天前上午')
  const olderB = await makeTask(page, pid, '五天前晚上')
  await finish(page, nowTask)
  await finish(page, yesterday, `${hoursBackToNoon(1)} hours`)
  // Same day, six hours apart: the later one must come first within the day.
  await finish(page, olderA, `${hoursBackToNoon(5)} hours`)
  await finish(page, olderB, `${hoursBackToNoon(5) - 6} hours`)

  await page.goto('/tasks/review?view=done')
  const headings = page.locator('section[data-panel]').getByRole('heading', { level: 2 })
  // Three days, newest first; the nearest two are told apart as Today / Yesterday.
  await expect(headings).toHaveCount(3)
  await expect(headings.nth(0)).toContainText('Today')
  await expect(headings.nth(1)).toContainText('Yesterday')
  const five = new Date(Date.now() - hoursBackToNoon(5) * 3_600_000)
  const fiveLabel = `${MONTHS[five.getMonth()]} ${five.getDate()}`
  await expect(headings.nth(2)).toContainText(fiveLabel)
  await expect(headings.nth(2)).not.toContainText('Today')
  await expect(headings.nth(2)).not.toContainText('Yesterday')

  await expect(rowsIn(page, /^Today · /)).toHaveCount(1)
  await expect(rowsIn(page, /^Yesterday · /)).toHaveCount(1)
  const old = rowsIn(page, new RegExp(fiveLabel))
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

  await page.goto('/tasks/review?view=done')
  await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(2)
  const restored = page.waitForResponse((r) => isTaskPatch(r) && r.ok())
  await page.getByRole('button', { name: 'Reopen “点错了”' }).click()
  expect((await restored).request().postDataJSON()).toEqual({ status: 'backlog' })
  await expect(page.getByText('点错了')).toHaveCount(0)
  await expect(page.getByText('真完成了')).toBeVisible()
  // Focus did not fall to <body>: it goes to the view's own heading, an h2 inside Review
  // and is there whether or not it is drawn.
  await expect(page.getByRole('heading', { name: 'Done', level: 2 })).toBeFocused()

  expect((await serverTasks(page, pid)).find((t) => t.title === '点错了')!.status).toBe('backlog')
  await page.reload()
  await expect(page.getByText('点错了')).toHaveCount(0)
  await expect(page.getByText('真完成了')).toBeVisible()
})

test('with nothing finished, the view says so', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/tasks/review?view=done')
  await expect(page.getByText('Nothing finished yet')).toBeVisible()
})

test('deleting a task from Done leaves focus on the list, not the page', async ({ page }) => {
  await registerFreshUser(page)
  const projectId = await makeProject(page, 'Finished')
  await makeTask(page, projectId, 'First done', { status: 'done' })
  await makeTask(page, projectId, 'Second done', { status: 'done' })
  await page.goto('/tasks/review?view=done')
  await page.getByText('First done').click()
  await page.getByRole('button', { name: 'Delete task' }).click()
  await page
    .getByRole('alertdialog', { name: 'Confirm deleting this task' })
    .getByRole('button', { name: 'Delete' })
    .click()
  await expect(page.getByText('First done')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY')
})

// ------------------------------------------------------------------------------ task deletion

/**
 * 打开一行的详情，停在阅读态。
 *
 * 删除住在阅读态的最底下（和删一个人、取消一场会同一个位置），所以这里不再按 Edit —— 那一节
 * 讲的是「未保存的改动」那条守卫，它自己会进编辑态。
 */
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
  const kid1 = await makeTask(page, pid, '子一', {}, root)
  await makeTask(page, pid, '子二', {}, root)
  await makeTask(page, pid, '孙一', {}, kid1)
  await makeTask(page, pid, '旁观者')
  await page.goto(`/projects/${pid}`)
  await page.getByRole('listitem').first().waitFor()

  const deletes: string[] = []
  page.on('request', (r) => r.method() === 'DELETE' && deletes.push(r.url()))

  await openPanel(page, '大块')
  await page.getByRole('button', { name: 'Delete task' }).click()
  const ask = page.getByRole('alertdialog', { name: 'Confirm deleting this task' })
  // Two children and one grandchild: three, not two (direct children only) and not four.
  await expect(ask).toContainText('Delete “大块” and its 3 subtasks. This cannot be undone.')
  expect(deletes).toHaveLength(0) // the first click only asks

  // Cancel: nothing was deleted, on the server or on the screen, and the panel is still there.
  await ask.getByRole('button', { name: 'Cancel' }).click()
  await expect(ask).toHaveCount(0)
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete task' })).toBeFocused()
  await page.waitForTimeout(200)
  expect(deletes).toHaveLength(0)
  expect((await serverTasks(page, pid)).map((t) => t.title).sort()).toEqual(
    ['大块', '子一', '子二', '孙一', '旁观者'].sort(),
  )

  // Escape is also "no", and it cancels the question rather than closing the panel.
  await page.getByRole('button', { name: 'Delete task' }).click()
  await expect(ask).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(ask).toHaveCount(0)
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(deletes).toHaveLength(0)
  expect(await serverTasks(page, pid)).toHaveLength(5)

  // Confirm: the whole subtree is gone on the server, the bystander is not.
  await page.getByRole('button', { name: 'Delete task' }).click()
  await ask.getByRole('button', { name: 'Delete' }).click()
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
  await makeTask(page, pid, '在做的', { status: 'in_progress' })
  await makeTask(page, pid, '另一个', { status: 'in_progress' })
  await page.goto('/tasks/today')
  await expect(page.locator('[data-today-row]')).toHaveCount(2)

  await page.locator('[data-today-row]').filter({ hasText: '在做的' }).click()
  await page.getByRole('button', { name: 'Delete task' }).click()
  const ask = page.getByRole('alertdialog', { name: 'Confirm deleting this task' })
  await expect(ask).toContainText('Delete “在做的”. This cannot be undone.')
  await expect(ask).not.toContainText('subtask')
  await ask.getByRole('button', { name: 'Delete' }).click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('在做的')).toHaveCount(0)
  await expect(page.getByText('另一个')).toBeVisible()
  expect((await serverTasks(page, pid)).map((t) => t.title)).toEqual(['另一个'])
  const today = (await (await page.request.get('/api/v1/tasks/today')).json()).tasks as {
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
  await editDetail(page)
  await page.getByLabel('Title').fill('写方案 v2')

  await nav(page).getByRole('link', { name: 'Today' }).click()
  // Still here: same page, panel open, the typing intact, and it says why.
  await expect(page).toHaveURL(new RegExp(`/projects/${pid}(\\?|$)`))
  await expect(page.getByRole('dialog')).toContainText(
    'You have unsaved changes. Leaving will discard them',
  )
  await expect(page.getByLabel('Title')).toHaveValue('写方案 v2')

  await page.getByRole('button', { name: 'Keep editing' }).click()
  await expect(page.getByRole('dialog').getByText('You have unsaved changes')).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`/projects/${pid}(\\?|$)`))
  await expect(page.getByLabel('Title')).toHaveValue('写方案 v2')

  // The browser's back button is a navigation too.
  await page.goBack()
  await expect(page.getByRole('dialog')).toContainText(
    'You have unsaved changes. Leaving will discard them',
  )
  await expect(page).toHaveURL(new RegExp(`/projects/${pid}(\\?|$)`))
  await page.getByRole('button', { name: 'Keep editing' }).click()

  await nav(page).getByRole('link', { name: 'Review' }).click()
  await page.getByRole('button', { name: 'Discard changes' }).click()
  await expect(page).toHaveURL(/\/tasks\/review$/)
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
  await editDetail(page)
  await page.getByLabel('Title').fill('写方案 v2')
  await page.getByLabel('Title').fill('写方案') // back to what it was: not dirty
  await nav(page).getByRole('link', { name: 'Projects' }).click()
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
  await editDetail(page)
  await page.getByLabel('Title').fill('写方案 v2')

  const logouts: string[] = []
  page.on('request', (r) => r.url().endsWith('/auth/logout') && logouts.push(r.url()))
  await logOut(page)
  await expect(page.getByRole('dialog')).toContainText(
    'You have unsaved changes. Leaving will discard them',
  )
  await expect(page.getByLabel('Title')).toHaveValue('写方案 v2')
  await expect(page.getByTestId('current-user')).toBeVisible()
  await page.waitForTimeout(300)
  expect(logouts).toHaveLength(0) // no logout request was sent
  // Still signed in on the server.
  expect((await page.request.get('/api/v1/auth/me')).ok()).toBeTruthy()

  await page.getByRole('button', { name: 'Keep editing' }).click()
  await expect(page.getByLabel('Title')).toHaveValue('写方案 v2')

  await logOut(page)
  await page.getByRole('button', { name: 'Discard changes' }).click()
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
  await editDetail(page)
  await page.getByLabel('Title').fill('写方案 v2')

  // Hold the save in flight, so "click Save, then a link" is deterministic rather than a race.
  await page.route('**/api/v1/tasks/*', async (route) => {
    if (route.request().method() === 'PATCH') await new Promise((r) => setTimeout(r, 800))
    await route.continue()
  })
  await page.getByRole('button', { name: 'Save' }).click()
  await nav(page).getByRole('link', { name: 'Today' }).click()
  await expect(page).toHaveURL(/\/tasks\/today$/)
  await expect(page.getByText('You have unsaved changes')).toHaveCount(0)
  // The save was not lost on the way.
  await expect
    .poll(async () => (await serverTasks(page, pid))[0]!.title, { timeout: 5000 })
    .toBe('写方案 v2')
})

/**
 * 删一个任务在阅读态里就看得见，和删一个人、取消一场会同一个位置。
 *
 * 以前它藏在编辑态的表底：不先按 Edit 就找不到删除，而删除根本不是「改一个字段」的同类。全 app
 * 统一成一条：毁掉这一个东西的动作在它那个面的最底、阅读态、危险色、问一次。
 */
test('删除在阅读态就在那儿，而且是面里最后一个东西', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写迁移')
  await page.goto(`/projects/${pid}`)
  await page.getByRole('listitem').filter({ hasText: '写迁移' }).first().click()
  const pane = page.getByRole('dialog')
  await expect(pane).toBeVisible()

  // 没按 Edit：删除就在那儿。
  const remove = pane.getByRole('button', { name: 'Delete task' })
  await expect(remove).toBeVisible()
  await expect(pane.getByRole('button', { name: 'Save' })).toHaveCount(0)

  // 而且是最后一个：它下面没有别的控件可以划过去碰到。
  const [box, notes] = await Promise.all([
    remove.boundingBox(),
    pane.getByText('Notes', { exact: true }).boundingBox(),
  ])
  expect(box!.y).toBeGreaterThan(notes!.y)
})
