import { expect, test, type Page } from '@playwright/test'
import { apiPost, makeProject, makeTask, registerFreshUser } from './helpers'

/**
 * THE CALENDAR (FR-080, artboard 13), on the server pinned at Thursday, October 22, 2026, 00:30
 * UTC: October's grid with its lunar names, what each day holds, and the chosen day beside the
 * grid on a wide screen or over it on a narrower one.
 */
test.use({ timezoneId: 'Europe/London' })

const square = (page: Page, day: string) => page.locator(`[data-day="${day}"]`)

/** The month of the artboard: a meeting with a link, a deadline and three planned on the 22nd. */
async function october(page: Page) {
  const jh = await makeProject(page, 'Job hunt')
  const mf = await makeProject(page, 'Moving flat')
  await makeTask(page, jh, 'Prepare the system design round', { dueAt: '2026-10-22T16:00:00Z' })
  for (const [project, title] of [
    [jh, 'Confirm the onsite date with Priya'],
    [mf, '量一下客厅的尺寸'],
    [mf, 'Book the van for moving day'],
  ] as const)
    await makeTask(page, project, title, { scheduledOn: '2026-10-22' })
  await makeTask(page, mf, 'Renew the contents insurance', { dueAt: '2026-10-20T16:00:00Z' })
  await apiPost(page, '/meetings', {
    title: 'Stripe: first screen',
    startsLocal: '2026-10-22T14:00',
    timeZone: 'Europe/London',
    durationMinutes: 45,
    joinUrl: 'https://meet.google.com/abc-defg-hij',
    projectId: jh,
  })
  return { jh, mf }
}

test.describe('on the 27-inch screen', () => {
  test.use({ viewport: { width: 2560, height: 1310 } })

  test('the month has its lunar names, its key, and counts what is planned', async ({ page }) => {
    await registerFreshUser(page, '/')
    await october(page)
    await page.goto('/calendar')

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('October 2026')
    await expect(page.locator('[data-lunar-month-name]')).toHaveText(['八月', '九月'])
    await expect(page.getByRole('list', { name: 'Key' }).getByRole('listitem')).toHaveText([
      'Meeting',
      'Due',
      'Late',
      'Birthday',
      'Follow up',
    ])
    await expect(square(page, '2026-10-10').locator('[data-lunar-day]')).toHaveText('九月')
    await expect(square(page, '2026-10-18').locator('[data-lunar-day]')).toHaveText('重阳')

    const thursday = square(page, '2026-10-22')
    await expect(thursday.locator('[data-planned]')).toHaveText('3 planned')
    await expect(thursday).not.toContainText('Book the van for moving day')
    await expect(thursday.locator('[data-entry]')).toHaveText([
      /14:00\s*Stripe: first screen/,
      /Prepare the system design round/,
    ])
    // Past its day a deadline is late: red, not grey.
    await expect(square(page, '2026-10-20').locator('[data-entry="due"]')).toHaveClass(/bg-stop-bg/)
  })

  test('today is chosen, and choosing a day lists its meetings, deadlines and plans', async ({
    page,
  }) => {
    await registerFreshUser(page, '/')
    await october(page)
    await page.goto('/calendar')

    const day = page.getByRole('complementary', { name: 'Thursday, October 22' })
    await expect(day).toContainText('Today')
    const meetings = day.getByRole('region', { name: 'Meetings' })
    await expect(meetings).toContainText('14:00')
    await expect(meetings.getByRole('link', { name: 'Join Stripe: first screen' })).toHaveAttribute(
      'href',
      'https://meet.google.com/abc-defg-hij',
    )
    await expect(day.getByRole('region', { name: 'Due' })).toContainText(
      'Prepare the system design round',
    )
    await expect(day.getByRole('region', { name: 'Planned' }).getByRole('listitem')).toHaveCount(3)

    await square(page, '2026-10-20').click({ position: { x: 100, y: 120 } })
    await expect(page).toHaveURL(/day=2026-10-20/)
    const tuesday = page.getByRole('complementary', { name: 'Tuesday, October 20' })
    await expect(tuesday.getByRole('region', { name: 'Due' })).toContainText('Late')
    await expect(tuesday).not.toContainText('Today')
  })

  test('a task planned from a day is planned for it', async ({ page }) => {
    await registerFreshUser(page, '/')
    await october(page)
    await page.goto('/calendar?day=2026-10-24')

    await page.getByRole('button', { name: 'Plan a task' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('textbox', { name: /title/i }).fill('Measure the hallway')
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(square(page, '2026-10-24').locator('[data-planned]')).toHaveText('1 planned')
  })

  test('a meeting made from a day is held on it', async ({ page }) => {
    await registerFreshUser(page, '/')
    await page.goto('/calendar?day=2026-10-27')

    await page.getByRole('button', { name: 'New meeting' }).click()
    await expect(page.getByRole('dialog').getByLabel('Date', { exact: true })).toHaveValue(
      '2026-10-27',
    )
  })

  test('a busy day shows three and says how many more', async ({ page }) => {
    await registerFreshUser(page, '/')
    const pid = await makeProject(page, 'CTWS')
    for (const title of ['一件', '二件', '三件', '四件', '五件', '六件'])
      await makeTask(page, pid, title, { dueAt: '2026-10-27T12:00:00Z' })
    await page.goto('/calendar')

    await expect(square(page, '2026-10-27').locator('[data-entry]')).toHaveCount(3)
    await expect(square(page, '2026-10-27')).toContainText('+3 more')
  })
})

test('on a MacBook Air the chosen day opens over the grid and closes with Esc', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await registerFreshUser(page, '/')
  await october(page)
  await page.goto('/calendar')
  await expect(square(page, '2026-10-22').locator('[data-planned]')).toBeVisible()
  // Nothing is chosen until a day is.
  await expect(page.getByRole('heading', { level: 2, name: 'Thursday, October 22' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Thursday, October 22' }).click()
  const pane = page.getByRole('heading', { level: 2, name: 'Thursday, October 22' })
  await expect(pane).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(pane).toHaveCount(0)
  await expect(page).not.toHaveURL(/day=/)
})
