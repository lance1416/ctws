import { expect, test, type Page } from '@playwright/test'
import { apiPost, registerFreshUser, WEB } from './helpers'
import { PINNED_AT } from './pinned'

/**
 * THE ONE PLACE THE ACCOUNT'S DAY IS NOT THE SERVER'S.
 *
 * The server runs in UTC. At the pinned instant (2026-10-22 00:30 UTC) an account in Niue
 * (UTC-11, no DST) is still on Wednesday, October 21: a server or a page that worked the day out
 * in UTC instead of the account's zone puts things on the wrong day, and these tests see it. Every
 * expected day comes from the pinned instant, so they say the same thing whenever they run.
 *
 * The other direction (an account already on the next day) is pinned on the server side by
 * `listToday`'s fixed-clock cases in apps/api/tests/modules/tasks/today.test.ts.
 */
const ACCOUNT_TZ = 'Pacific/Niue'
/** The account's today, yesterday and tomorrow at the pinned instant, in Niue. */
const TODAY = '2026-10-21'
const YESTERDAY = '2026-10-20'
/** The server's own (UTC) day at the pinned instant: the account's tomorrow. */
const UTC_DAY = '2026-10-22'

test.use({ timezoneId: ACCOUNT_TZ })

const task = async (page: Page, projectId: string, title: string, fields: object) => {
  const made = await apiPost(page, '/tasks', { projectId, title, parentId: null })
  const res = await page.request.patch(`/api/v1/tasks/${made.id}`, { headers: WEB, data: fields })
  expect(res.ok(), await res.text()).toBe(true)
}
const planned = (page: Page) => page.getByRole('region', { name: 'Planned for today' })
const listed = (page: Page, title: string) =>
  page
    .locator('li')
    .filter({ has: page.locator('[data-today-row]') })
    .filter({ hasText: title })

test('the premise: an account in Niue, on a server pinned where Niue is a day behind UTC', async ({
  page,
}) => {
  await registerFreshUser(page)
  const me = (await (await page.request.get('/api/v1/auth/me')).json()) as {
    timezone: string
    now: string
    clockPinned: boolean
  }
  expect(me.timezone).toBe(ACCOUNT_TZ)
  expect(me.clockPinned).toBe(true)
  // Within the ten hours the dates below hold for (pinned.ts).
  const ran = Date.parse(me.now) - Date.parse(PINNED_AT)
  expect(ran).toBeGreaterThanOrEqual(0)
  expect(ran).toBeLessThan(10 * 3600_000)
})

test('today is the account’s day, for the list and the heading alike', async ({ page }) => {
  await registerFreshUser(page)
  const project = await apiPost(page, '/projects', { name: 'Time zone' })
  await task(page, project.id, '账户的今天', { scheduledOn: TODAY })
  await page.goto('/today')
  // The server compared the plan with the account's day, not its own UTC one.
  await expect(listed(page, '账户的今天')).toBeVisible()
  await expect(listed(page, '账户的今天').locator('[data-date-hint]')).toHaveCount(0)
  // And the page's heading agrees: the day comes from the account's zone.
  await expect(page.locator('#today-heading')).toHaveText('Wednesday, October 21')
})

test('the server’s UTC day is the account’s tomorrow, and yesterday is carried', async ({
  page,
}) => {
  await registerFreshUser(page)
  const project = await apiPost(page, '/projects', { name: 'Time zone' })
  await task(page, project.id, '按UTC排的', { scheduledOn: UTC_DAY })
  await task(page, project.id, '昨天的计划', { scheduledOn: YESTERDAY })
  await page.goto('/today')
  await expect(listed(page, '昨天的计划')).toBeVisible()
  // Tuesday, in the account's week.
  await expect(listed(page, '昨天的计划').locator('[data-date-hint="carried"]')).toHaveText(
    'Carried from Tue',
  )
  // Not yet arrived for the account: nothing on Today's lists says it is due.
  await expect(listed(page, '按UTC排的')).toHaveCount(0)
})

test('a deadline inside the account’s day counts as today on another UTC date', async ({
  page,
}) => {
  await registerFreshUser(page)
  const project = await apiPost(page, '/projects', { name: 'Time zone' })
  // 00:30 on October 21 in Niue is 11:30 UTC on the 21st: the account's today, the server's
  // yesterday. A server that built the day's bounds in its own zone would call it overdue.
  await task(page, project.id, '今天之内截止', { dueAt: '2026-10-21T11:30:00Z' })
  await page.goto('/today')
  await expect(planned(page).getByText('今天之内截止')).toBeVisible()
  await expect(listed(page, '今天之内截止').locator('[data-row-mark]')).toHaveText('Due today')
  await expect(page.getByRole('region', { name: 'Overdue' })).toHaveCount(0)
})
