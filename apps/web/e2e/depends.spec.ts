import { expect, test, type Page } from '@playwright/test'
import { makeProject, makeTask, openTree, registerFreshUser, WEB } from './helpers'

/**
 * WHAT HAS TO HAPPEN FIRST, through the browser.
 *
 * The API suite already pins the edges -- loops refused, tenants separated, both directions
 * readable. What only a browser can show is the part the feature was built for: a list stops
 * answering what is DUE and starts answering what can be WORKED ON, with the thing in the way
 * named on the row instead of hidden behind a click.
 */

const row = (page: Page, title: string) =>
  page
    .locator('li[data-depth]')
    .filter({ has: page.getByRole('button', { name: `Task: ${title}`, exact: true }) })

const pane = (page: Page) => page.getByRole('dialog', { name: 'Task details' })

const openPane = async (page: Page, title: string) => {
  // The ROW opens the pane; the `Task: X` button inside it is the status marker.
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
  const dep = await page.request.put(`/api/v1/tasks/${ship}/dependencies/${ci}`, { headers: WEB })
  expect(dep.status()).toBe(204)
  await openTree(page, pid)

  // NAMED, not merely marked: the point of the phrase is that nobody has to click to find out.
  await expect(row(page, '发 v0.8.0').locator('[data-row-title]')).toHaveAttribute(
    'title',
    'Blocked by “跑通 CI”',
  )
  // PRESENT, and its Due column says it is waiting -- a list that drops tasks cannot be trusted.
  await expect(row(page, '发 v0.8.0')).toBeVisible()
  await expect(row(page, '发 v0.8.0').locator('[data-row-due]')).toHaveText('Waiting')

  // Finishing the blocker is the only write. Nothing touches the waiting task.
  await openPane(page, '跑通 CI')
  await pane(page).getByRole('button', { name: 'Edit', exact: true }).click()
  await pane(page).getByRole('radio', { name: 'Done', exact: true }).check()
  await pane(page).getByRole('button', { name: 'Save' }).click()
  await expect(row(page, '跑通 CI')).toHaveCount(0)

  await expect(row(page, '发 v0.8.0').locator('[data-row-due="waiting"]')).toHaveCount(0)
  await expect(row(page, '发 v0.8.0').locator('[data-row-title]')).not.toHaveAttribute('title', /./)
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
  await expect(pane(page).getByText('None', { exact: true })).toBeVisible()
  await pane(page).getByRole('button', { name: 'Add', exact: true }).click()
  await pane(page).getByLabel('Search for a task to wait on').fill('rrgen')
  await pane(page)
    .getByRole('button', { name: /跑通 rrgen 的 CI/ })
    .click()

  // The pane says which project the other end is in: a dependency that crosses projects is the
  // usual case here, and a bare title would not say where to go looking.
  await expect(waitingFor(page)).toContainText(['跑通 rrgen 的 CI'])
  await expect(waitingFor(page).first()).toContainText('rrgen')
  await expect(row(page, '发 v0.8.0').locator('[data-row-title]')).toHaveAttribute(
    'title',
    'Blocked by “跑通 rrgen 的 CI”',
  )
})

test('the search never offers the task itself', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  await makeTask(page, pid, '配色重做')
  await makeTask(page, pid, '配色重做的收尾')
  await openTree(page, pid)

  await openPane(page, '配色重做的收尾')
  await pane(page).getByRole('button', { name: 'Add', exact: true }).click()
  await pane(page).getByLabel('Search for a task to wait on').fill('配色重做')

  // The sibling is offered; itself is not. A task waiting for itself is the one edge the server refuses
  // outright, and an interface that proposes it is proposing something it knows cannot happen.
  // Both titles match the query, so the count is the assertion: one candidate, and it is the
  // sibling. A candidate is named "<title> <project>", hence the anchored patterns.
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
  await page.request.put(`/api/v1/tasks/${ship}/dependencies/${ci}`, { headers: WEB })
  await openTree(page, pid)

  await openPane(page, '发 v0.8.0')
  await expect(waitingFor(page)).toHaveCount(1)
  // The project is named only when it is a DIFFERENT one: repeating the name of the project you
  // are already looking at is noise, which is why the tree's rows leave it out too.
  await expect(waitingFor(page).first()).not.toContainText('改版')
  await pane(page).getByRole('button', { name: 'Remove dependency “跑通 CI”' }).click()
  await expect(waitingFor(page)).toHaveCount(0)
  await expect(row(page, '发 v0.8.0').locator('[data-row-due="waiting"]')).toHaveCount(0)
  await expect(row(page, '发 v0.8.0').locator('[data-row-title]')).not.toHaveAttribute('title', /./)
})

test('a dependency removal that fails says so', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Stuck')
  const ci = await makeTask(page, pid, 'Green CI')
  const ship = await makeTask(page, pid, 'Ship it')
  await page.request.put(`/api/v1/tasks/${ship}/dependencies/${ci}`, { headers: WEB })
  await openTree(page, pid)
  await openPane(page, 'Ship it')
  await page.route('**/api/v1/tasks/*/dependencies/*', (r) =>
    r.request().method() === 'DELETE' ? r.fulfill({ status: 500, body: '{}' }) : r.continue(),
  )
  await pane(page).getByRole('button', { name: 'Remove dependency “Green CI”' }).click()
  await expect(pane(page).getByRole('alert')).toContainText("Couldn't remove that dependency")
  await expect(waitingFor(page)).toHaveCount(1)
})

test('the other end shows the edge too, and offers no way to undo it from there', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  const ci = await makeTask(page, pid, '跑通 CI')
  const ship = await makeTask(page, pid, '发 v0.8.0')
  await page.request.put(`/api/v1/tasks/${ship}/dependencies/${ci}`, { headers: WEB })
  await openTree(page, pid)

  await openPane(page, '跑通 CI')
  await expect(inTheWayOf(page)).toContainText(['发 v0.8.0'])
  // The edge belongs to the WAITING task's list. Removing it from here would be editing a task
  // that is not open.
  await expect(pane(page).getByRole('button', { name: /Remove dependency/ })).toHaveCount(0)
})

test('a loop is refused in words, not by silently doing nothing', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  const a = await makeTask(page, pid, '搭脚手架')
  const b = await makeTask(page, pid, '接上后端')
  await page.request.put(`/api/v1/tasks/${b}/dependencies/${a}`, { headers: WEB })
  await openTree(page, pid)

  // A waiting for B would close the loop.
  await openPane(page, '搭脚手架')
  await pane(page).getByRole('button', { name: 'Add', exact: true }).click()
  await pane(page).getByLabel('Search for a task to wait on').fill('接上后端')
  await pane(page)
    .getByRole('button', { name: /接上后端/ })
    .click()

  await expect(pane(page).getByRole('alert')).toHaveText(
    'That would leave the two waiting on each other',
  )
  await expect(waitingFor(page)).toHaveCount(0)
})
