import { expect, test, type Page } from '@playwright/test'
import { apiPost, registerFreshUser, WEB } from './helpers'

/**
 * WHAT A TODAY ROW SAYS ABOUT ITS DATES, on the server pinned at Thursday, October 22, 2026, 00:30
 * UTC (01:30 in London): every expected word comes from that instant (pinned.ts), so none of it
 * depends on what time the suite happens to run.
 */
test.use({ timezoneId: 'Europe/London' })

const task = async (page: Page, projectId: string, title: string, fields: object) => {
  const made = await apiPost(page, '/tasks', { projectId, title, parentId: null })
  const res = await page.request.patch(`/api/v1/tasks/${made.id}`, { headers: WEB, data: fields })
  expect(res.ok(), await res.text()).toBe(true)
}
const row = (page: Page, block: string, title: string) =>
  page
    .getByRole('region', { name: block, exact: true })
    .getByRole('listitem')
    .filter({ hasText: title })

test('the marks say due today, tomorrow, how late, and where a plan was carried from', async ({
  page,
}) => {
  await registerFreshUser(page)
  const project = await apiPost(page, '/projects', { name: '记号' })
  // 18:00 on the 22nd in London: today, later on. In progress, so it stays In progress (FR-079).
  await task(page, project.id, '今天截止', { status: 'in_progress', dueAt: '2026-10-22T17:00:00Z' })
  await task(page, project.id, '明天截止', { status: 'in_progress', dueAt: '2026-10-23T11:00:00Z' })
  await task(page, project.id, '七天前截止', { dueAt: '2026-10-15T11:00:00Z' })
  // Sunday the 18th: within the week, so said by its weekday (artboard 12).
  await task(page, project.id, '顺延的', { scheduledOn: '2026-10-18' })
  await page.goto('/today')

  await expect(page.locator('#today-heading')).toHaveText('Thursday, October 22')
  await expect(row(page, 'In progress', '今天截止').locator('[data-row-mark]')).toHaveText(
    'Due today',
  )
  await expect(row(page, 'In progress', '明天截止').locator('[data-row-mark]')).toHaveText(
    'Tomorrow',
  )
  await expect(row(page, 'Overdue', '七天前截止').locator('[data-row-mark]')).toHaveText(
    '7 days late',
  )
  await expect(row(page, 'Planned for today', '顺延的')).toContainText('Carried from Sun')
})
