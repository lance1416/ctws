import { expect, test, type Page } from '@playwright/test'
import { apiPost, registerFreshUser } from './helpers'

/**
 * MEETINGS NOT TODAY, on the server pinned at Thursday, October 22, 2026, 00:30 UTC (01:30 in
 * London, pinned.ts): last week's occurrence is Thursday the 15th, in this year, and March 2028
 * is more than a year ahead, whenever the suite runs.
 */
test.use({ timezoneId: 'Europe/London' })

const pane = (page: Page) => page.getByRole('dialog', { name: 'Meetings' })

test('a past occurrence opens as itself, not as the next one', async ({ page }) => {
  await registerFreshUser(page)
  // Weekly on Thursdays from the 8th: the 8th and the 15th are over, today's is still to come.
  await apiPost(page, '/meetings', {
    title: 'Standing call',
    startsLocal: '2026-10-08T09:00',
    timeZone: 'Europe/London',
    durationMinutes: 30,
    rrule: 'FREQ=WEEKLY;BYDAY=TH',
  })
  await page.goto('/meetings')
  await page.getByRole('button', { name: 'Earlier', exact: true }).click()
  // Earlier shows each series' latest occurrence: last week's.
  await page
    .getByRole('region', { name: 'Earlier' })
    .getByRole('button', { name: /Standing call/ })
    .click()
  await expect(page).toHaveURL(/at=2026-10-15T09(%3A|:)00/)
  // This year's day, so said without its year.
  await expect(pane(page)).toContainText('Oct 15, 09:00')
  await expect(pane(page)).not.toContainText('Oct 15, 2026')
})

test('a link to a meeting more than a year off still opens it', async ({ page }) => {
  await registerFreshUser(page)
  // Each beyond the year either side of the 22nd that the next and the latest are looked for in.
  const ahead = await apiPost(page, '/meetings', {
    title: 'Far ahead',
    startsLocal: '2028-03-14T18:00',
    timeZone: 'Europe/London',
    durationMinutes: 60,
  })
  const behind = await apiPost(page, '/meetings', {
    title: 'Long ago',
    startsLocal: '2024-03-14T18:00',
    timeZone: 'Europe/London',
    durationMinutes: 60,
  })
  // A weekly series that starts that far ahead opens its first occurrence: its next.
  const series = await apiPost(page, '/meetings', {
    title: 'Starts later',
    startsLocal: '2028-03-16T09:00',
    timeZone: 'Europe/London',
    durationMinutes: 30,
    rrule: 'FREQ=WEEKLY;BYDAY=TH',
  })

  await page.goto(`/meetings/${ahead.meetingId}`)
  await expect(pane(page)).toContainText('Far ahead')
  await expect(pane(page)).toContainText('Mar 14, 2028, 18:00')
  await page.goto(`/meetings/${behind.meetingId}`)
  await expect(pane(page)).toContainText('Long ago')
  await expect(pane(page)).toContainText('Mar 14, 2024, 18:00')
  await page.goto(`/meetings/${series.meetingId}`)
  await expect(pane(page)).toContainText('Starts later')
  await expect(pane(page)).toContainText('Mar 16, 2028, 09:00')
})
