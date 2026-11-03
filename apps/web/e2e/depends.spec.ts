import { expect, test, type Page } from '@playwright/test'
import { makeProject, makeTask, openTree, registerFreshUser, WEB } from './helpers'

// The API suite covers the edges themselves (loops refused, tenants separated, both directions
// readable); these cover what the list and the pane show of them.

const row = (page: Page, title: string) =>
  page
    .locator('li[data-depth]')
    .filter({ has: page.getByRole('button', { name: `Task: ${title}`, exact: true }) })

const pane = (page: Page) => page.getByRole('dialog', { name: 'Task details' })

const openPane = async (page: Page, title: string) => {
  // The row opens the pane; the `Task: X` button inside it is the status marker.
  await page.getByRole('listitem').filter({ hasText: title }).first().click()
  await expect(pane(page).locator('[data-detail-title]')).toHaveText(title)
}

/** The pane's dependency lists, which are the only place an edge can be removed. */
const waitingFor = (page: Page) => pane(page).locator('[data-blocked-by] li')
const inTheWayOf = (page: Page) => pane(page).locator('[data-blocks] li')
/** The picker Waiting on's Add opens. */
const waitsOn = (page: Page) => page.getByRole('dialog').filter({ hasText: 'waits on' })
/** Dependencies are added and taken away in the edit; read, they are only rows. */
const edit = (page: Page) => pane(page).getByRole('button', { name: 'Edit', exact: true }).click()

test('a blocked row names what is in the way, and finishing that frees it', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  const ci = await makeTask(page, pid, '跑通 CI')
  const ship = await makeTask(page, pid, '发 v0.8.0')
  const dep = await page.request.put(`/api/v1/tasks/${ship}/dependencies/${ci}`, { headers: WEB })
  expect(dep.status()).toBe(204)
  await openTree(page, pid)

  // Named, not merely marked, so nobody has to click to find out.
  await expect(row(page, '发 v0.8.0').locator('[data-row-title]')).toHaveAttribute(
    'title',
    'Blocked by “跑通 CI”',
  )
  // Still listed, and its Due column says it is waiting: a list that drops tasks cannot be trusted.
  await expect(row(page, '发 v0.8.0')).toBeVisible()
  await expect(row(page, '发 v0.8.0').locator('[data-row-due]')).toHaveText('Waiting')
  await expect(row(page, '发 v0.8.0').locator('[data-waiting-badge]')).toBeVisible()

  // Finishing the blocker is the only write. Nothing touches the waiting task.
  await openPane(page, '跑通 CI')
  await pane(page).getByRole('button', { name: 'Edit', exact: true }).click()
  await pane(page).getByRole('radio', { name: 'Done', exact: true }).check()
  await pane(page).getByRole('button', { name: 'Save' }).click()
  await expect(row(page, '跑通 CI')).toHaveCount(0)

  await expect(row(page, '发 v0.8.0').locator('[data-row-due="waiting"]')).toHaveCount(0)
  await expect(row(page, '发 v0.8.0').locator('[data-row-title]')).not.toHaveAttribute('title', /./)
  await expect(row(page, '发 v0.8.0').locator('[data-waiting-badge]')).toHaveCount(0)
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
  // Read with none, there is no line for them at all, not a "None".
  await expect(pane(page).getByText('Waiting on', { exact: true })).toHaveCount(0)
  await expect(pane(page).getByText('None', { exact: true })).toHaveCount(0)
  await edit(page)
  await pane(page).getByRole('button', { name: 'Add', exact: true }).click()
  // From the keyboard alone: type, and Enter takes the first.
  const search = waitsOn(page).getByRole('combobox', { name: 'Search' })
  // The answer for these words, not the likely few shown before any were typed.
  const answered = page.waitForResponse(
    (r) => r.url().includes('view=candidates') && r.url().includes('rrgen') && r.ok(),
  )
  await search.fill('rrgen')
  await answered
  await expect(waitsOn(page).getByRole('option', { name: /跑通 rrgen 的 CI/ })).toBeVisible()
  await search.press('Enter')
  await expect(waitsOn(page)).toHaveCount(0)

  // The pane says which project the other end is in: a dependency that crosses projects is the
  // usual case here, and a bare title would not say where to go looking.
  await expect(waitingFor(page)).toContainText(['跑通 rrgen 的 CI'])
  await expect(pane(page).getByText('Waiting on', { exact: true })).toBeVisible()
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
  await edit(page)
  await pane(page).getByRole('button', { name: 'Add', exact: true }).click()
  await waitsOn(page).getByRole('combobox', { name: 'Search' }).fill('配色重做')

  // Both titles match the query, so the count is the assertion: one candidate, the sibling.
  const candidates = waitsOn(page).getByRole('option')
  await expect(candidates).toHaveCount(1)
  await expect(candidates).toContainText('配色重做')
  await expect(candidates).not.toContainText('配色重做的收尾')
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
  // The project is named only when it is a different one.
  await expect(waitingFor(page).first()).not.toContainText('改版')
  await expect(pane(page).getByRole('button', { name: /Remove dependency/ })).toHaveCount(0)
  await edit(page)
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
  await edit(page)
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
  // The edge belongs to the waiting task. Removing it from here would be editing a task that is
  // not open, so not even the edit offers it.
  await edit(page)
  await expect(inTheWayOf(page)).toContainText(['发 v0.8.0'])
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
  await edit(page)
  await pane(page).getByRole('button', { name: 'Add', exact: true }).click()
  await waitsOn(page).getByRole('combobox', { name: 'Search' }).fill('接上后端')
  await waitsOn(page)
    .getByRole('option', { name: /接上后端/ })
    .click()

  // Said where the pick was made, which stays open to pick again.
  await expect(waitsOn(page)).toContainText('That would leave the two waiting on each other')
  await expect(waitingFor(page)).toHaveCount(0)
})
