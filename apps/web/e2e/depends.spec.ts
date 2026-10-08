import { expect, test, type Page } from '@playwright/test'
import { registerFreshUser } from './helpers'

/**
 * WHAT HAS TO HAPPEN FIRST (D64), through the browser.
 *
 * The API suite already pins the edges -- loops refused, tenants separated, both directions
 * readable. What only a browser can show is the part the feature was built for: a list stops
 * saying 「什么到期了」 and starts saying 「什么现在做得了」, and the thing in the way is NAMED on
 * the row instead of being a mystery behind a click.
 */

const HEADERS = { 'x-ctws-client': 'web' }

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

async function openTree(page: Page, projectId: string) {
  const listed = page.waitForResponse((r) => {
    const url = new URL(r.url())
    return (
      r.request().method() === 'GET' &&
      url.pathname === '/api/v1/tasks' &&
      url.searchParams.get('projectId') === projectId
    )
  })
  await page.goto(`/projects/${projectId}`)
  await listed
}

const row = (page: Page, title: string) =>
  page
    .locator('li[data-depth]')
    .filter({ has: page.getByRole('button', { name: `任务：${title}`, exact: true }) })

const pane = (page: Page) => page.getByRole('dialog', { name: '任务详情' })

const openPane = async (page: Page, title: string) => {
  // The ROW opens the pane; the `任务：X` button inside it is the status marker.
  await page.getByRole('listitem').filter({ hasText: title }).first().click()
  await expect(pane(page).locator('[data-detail-title]')).toHaveText(title)
}

/** The pane's dependency lists, which are the only place an edge can be removed. */
const waitingFor = (page: Page) => pane(page).locator('[data-blocked-by] li')
const inTheWayOf = (page: Page) => pane(page).locator('[data-blocks] li')

test('a blocked row names what is in the way, and finishing that frees it', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  const ci = await makeTask(page, pid, '跑通 CI')
  const ship = await makeTask(page, pid, '发 v0.8.0')
  const dep = await page.request.post(`/api/v1/tasks/${ship}/dependencies`, {
    headers: HEADERS,
    data: { blockerId: ci },
  })
  expect(dep.ok()).toBeTruthy()
  await openTree(page, pid)

  // NAMED, not merely marked: the point of the phrase is that nobody has to click to find out.
  await expect(row(page, '发 v0.8.0').locator('[data-row-blocked]')).toHaveText('被「跑通 CI」挡着')
  // Dimmed but PRESENT -- a list that drops tasks cannot be trusted.
  await expect(row(page, '发 v0.8.0')).toBeVisible()

  // Finishing the blocker is the only write. Nothing touches the waiting task.
  await openPane(page, '跑通 CI')
  await pane(page).getByRole('button', { name: '编辑', exact: true }).click()
  await pane(page).getByRole('radio', { name: '已完成', exact: true }).check()
  await pane(page).getByRole('button', { name: '保存' }).click()
  await expect(row(page, '跑通 CI')).toHaveCount(0)

  await expect(row(page, '发 v0.8.0').locator('[data-row-blocked]')).toHaveCount(0)
})

test('a dependency is added by searching, and it reaches into another project', async ({
  page,
}) => {
  await registerFreshUser(page)
  const other = await makeProject(page, 'rrgen')
  await makeTask(page, other, '跑通 rrgen 的 CI')
  const mine = await makeProject(page, 'CTWS')
  await makeTask(page, mine, '发 v0.8.0')
  await openTree(page, mine)

  await openPane(page, '发 v0.8.0')
  await expect(pane(page).getByText('没有', { exact: true })).toBeVisible()
  await pane(page).getByRole('button', { name: '添加', exact: true }).click()
  await pane(page).getByLabel('搜索要等的任务').fill('rrgen')
  await pane(page)
    .getByRole('button', { name: /跑通 rrgen 的 CI/ })
    .click()

  // The pane says which project the other end is in: a dependency that crosses projects is the
  // usual case here, and a bare title would not say where to go looking.
  await expect(waitingFor(page)).toContainText(['跑通 rrgen 的 CI'])
  await expect(waitingFor(page).first()).toContainText('rrgen')
  await expect(row(page, '发 v0.8.0').locator('[data-row-blocked]')).toHaveText(
    '被「跑通 rrgen 的 CI」挡着',
  )
})

test('the search never offers the task itself', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  await makeTask(page, pid, '配色重做')
  await makeTask(page, pid, '配色重做的收尾')
  await openTree(page, pid)

  await openPane(page, '配色重做的收尾')
  await pane(page).getByRole('button', { name: '添加', exact: true }).click()
  await pane(page).getByLabel('搜索要等的任务').fill('配色重做')

  // The sibling is offered; itself is not. 「自己等自己」 is the one edge the server refuses
  // outright, and an interface that proposes it is proposing something it knows cannot happen.
  // Both titles match the query, so the count is the assertion: one candidate, and it is the
  // sibling. A candidate is named 「<title> <project>」, hence the anchored patterns.
  const candidates = pane(page).locator('[data-dep-candidates] li')
  await expect(candidates).toHaveCount(1)
  await expect(candidates.getByRole('button', { name: /^配色重做 / })).toHaveCount(1)
  await expect(candidates.getByRole('button', { name: /^配色重做的收尾/ })).toHaveCount(0)
})

test('a dependency is removed from the pane, and the row stops waiting', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  const ci = await makeTask(page, pid, '跑通 CI')
  const ship = await makeTask(page, pid, '发 v0.8.0')
  await page.request.post(`/api/v1/tasks/${ship}/dependencies`, {
    headers: HEADERS,
    data: { blockerId: ci },
  })
  await openTree(page, pid)

  await openPane(page, '发 v0.8.0')
  await expect(waitingFor(page)).toHaveCount(1)
  // The project is named only when it is a DIFFERENT one: repeating the name of the project you
  // are already looking at is noise, which is why the tree's rows leave it out too.
  await expect(waitingFor(page).first()).not.toContainText('改版')
  await pane(page).getByRole('button', { name: '移除依赖「跑通 CI」' }).click()
  await expect(waitingFor(page)).toHaveCount(0)
  await expect(row(page, '发 v0.8.0').locator('[data-row-blocked]')).toHaveCount(0)
})

test('the other end shows the edge too, and offers no way to undo it from there', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  const ci = await makeTask(page, pid, '跑通 CI')
  const ship = await makeTask(page, pid, '发 v0.8.0')
  await page.request.post(`/api/v1/tasks/${ship}/dependencies`, {
    headers: HEADERS,
    data: { blockerId: ci },
  })
  await openTree(page, pid)

  await openPane(page, '跑通 CI')
  await expect(inTheWayOf(page)).toContainText(['发 v0.8.0'])
  // The edge belongs to the WAITING task's list. Removing it from here would be editing a task
  // that is not open.
  await expect(pane(page).getByRole('button', { name: /移除依赖/ })).toHaveCount(0)
})

test('a loop is refused in words, not by silently doing nothing', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  const a = await makeTask(page, pid, '搭脚手架')
  const b = await makeTask(page, pid, '接上后端')
  await page.request.post(`/api/v1/tasks/${b}/dependencies`, {
    headers: HEADERS,
    data: { blockerId: a },
  })
  await openTree(page, pid)

  // A waiting for B would close the loop.
  await openPane(page, '搭脚手架')
  await pane(page).getByRole('button', { name: '添加', exact: true }).click()
  await pane(page).getByLabel('搜索要等的任务').fill('接上后端')
  await pane(page)
    .getByRole('button', { name: /接上后端/ })
    .click()

  await expect(pane(page).getByRole('alert')).toHaveText('这样两件事会互相等着')
  await expect(waitingFor(page)).toHaveCount(0)
})
