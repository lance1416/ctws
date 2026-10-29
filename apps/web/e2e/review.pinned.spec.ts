import { expect, test } from '@playwright/test'
import { apiPost, makeProject, makeTask, registerFreshUser, WEB } from './helpers'

/**
 * THE REVIEW'S PANEL AND WEEKS (FR-081, artboard 19), on the server pinned at Thursday, October 22,
 * 2026, 00:30 UTC: the stages that moved, what else the week held, counted by every module, and
 * the weeks in the sidebar on one scale.
 */
test.use({ timezoneId: 'Europe/London', viewport: { width: 1440, height: 900 } })

test('beside the table: the stages that moved and what else the week held', async ({ page }) => {
  await registerFreshUser(page, '/')
  const jh = await makeProject(page, 'Job hunt')
  const put = await page.request.put(`/api/v1/projects/${jh}/stages`, {
    headers: WEB,
    data: { stages: [{ name: 'Applied' }, { name: 'Onsite' }] },
  })
  const { stages } = (await put.json()) as { stages: { id: string }[] }
  await makeTask(page, jh, 'SDE II', { stageId: stages[1]!.id })
  const priya = await apiPost(page, '/people', { givenName: 'Priya', familyName: 'Nair' })
  await apiPost(page, '/communication', {
    direction: 'sent',
    channel: 'email',
    parties: [{ type: 'person', id: priya.id }],
    occurredAt: '2026-10-20T09:00:00Z',
  })
  await apiPost(page, '/meetings', {
    title: 'Recruiter call',
    startsLocal: '2026-10-20T14:00',
    timeZone: 'Europe/London',
    durationMinutes: 30,
  })
  await page.goto('/review?week=2026-10-19')

  const brief = page.getByRole('complementary', { name: 'This week in brief' })
  const stagesMoved = brief.getByRole('region', { name: 'Stages moved' })
  await expect(stagesMoved.getByRole('heading')).toHaveText(/Stages moved\s*1/)
  await expect(stagesMoved.getByRole('listitem')).toHaveText([/SDE II.*Onsite/])
  const also = brief.getByRole('region', { name: 'Also this week' })
  await expect(also.getByRole('listitem')).toHaveText([
    /Meetings held\s*1/,
    /With notes\s*0/,
    /Messages sent\s*1/,
    /Messages received\s*0/,
    /Reading finished\s*0/,
    /People added\s*1/,
  ])
})

test('the weeks are under their months, every bar on one scale', async ({ page }) => {
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, 'CTWS')
  for (const title of ['one', 'two']) await makeTask(page, pid, title, { status: 'done' })
  await page.goto('/review')

  const weeks = page.getByRole('navigation', { name: 'Weeks' })
  await expect(
    weeks.getByRole('region', { name: 'October' }).getByRole('button').first(),
  ).toHaveText(/Oct 19, so far\s*2/)
  // From the first change, here this week, but last week at least.
  await expect(weeks.getByRole('button')).toHaveText([/Oct 19, so far\s*2/, /Oct 12\s*0/])
  // It opens on last week, the one a review is of; this week is there, so far.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Week of October 12')
  await expect(page.locator('[data-review-total]')).toHaveText(/0\s*finished\s*this week/)

  await weeks.getByRole('button', { name: /Oct 19, so far/ }).click()
  await expect(page).toHaveURL(/week=2026-10-19/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Week of October 19')
  await expect(page.locator('[data-review-total]')).toHaveText(/2\s*finished\s*so far/)
})
