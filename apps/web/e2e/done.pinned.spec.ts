import { expect, test, type Page } from '@playwright/test'
import { completedAt, makeProject, makeTask, registerFreshUser, WEB } from './helpers'

/**
 * THE COMPLETED LIST'S DAYS, on the server pinned at Thursday, October 22, 2026, 00:30 UTC (01:30
 * in London, pinned.ts). Each completion is put on a fixed instant, so which heading it falls under
 * does not depend on the hour the suite runs at.
 */
test.use({ timezoneId: 'Europe/London' })

/** Finishes a task through the API: the pinned clock stamps it today. */
async function finish(page: Page, id: string) {
  const p = await page.request.patch(`/api/v1/tasks/${id}`, {
    headers: WEB,
    data: { status: 'done' },
  })
  expect(p.status()).toBe(200)
}

const rowsIn = (page: Page, section: string | RegExp) =>
  page.getByRole('region', { name: section }).getByRole('listitem')

test('the completed list is grouped by day, newest day and newest task first', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'History')
  const nowTask = await makeTask(page, pid, '刚刚完成')
  const yesterday = await makeTask(page, pid, '昨天完成')
  const olderA = await makeTask(page, pid, '五天前上午')
  const olderB = await makeTask(page, pid, '五天前晚上')
  await finish(page, nowTask)
  for (const id of [yesterday, olderA, olderB]) await finish(page, id)
  // Noon yesterday, and Saturday the 17th at 10:00 and 16:00, all in London.
  completedAt(yesterday, '2026-10-21T11:00:00Z')
  // Same day, six hours apart: the later one must come first within the day.
  completedAt(olderA, '2026-10-17T09:00:00Z')
  completedAt(olderB, '2026-10-17T15:00:00Z')

  await page.goto('/review?view=done')
  const headings = page.locator('section[data-panel]').getByRole('heading', { level: 2 })
  // Three days, newest first; the nearest two are told apart as Today / Yesterday.
  await expect(headings).toHaveCount(3)
  await expect(headings.nth(0)).toContainText('Today')
  await expect(headings.nth(1)).toContainText('Yesterday')
  await expect(headings.nth(2)).toContainText('Oct 17')
  await expect(headings.nth(2)).not.toContainText('Today')
  await expect(headings.nth(2)).not.toContainText('Yesterday')

  await expect(rowsIn(page, /^Today · /)).toHaveCount(1)
  await expect(rowsIn(page, /^Yesterday · /)).toHaveCount(1)
  const old = rowsIn(page, /Oct 17/)
  await expect(old).toHaveCount(2)
  await expect(old.nth(0)).toContainText('五天前晚上')
  await expect(old.nth(1)).toContainText('五天前上午')

  // Every row carries a time of day: the account's, not the server's.
  await expect(old.nth(0).locator('time')).toHaveText('16:00')
  await expect(old.nth(1).locator('time')).toHaveText('10:00')
})
