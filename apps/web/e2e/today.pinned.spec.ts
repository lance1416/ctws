import { expect, test, type Page } from '@playwright/test'
import { apiPost, registerFreshUser, WEB } from './helpers'

/**
 * WHAT A TODAY ROW SAYS ABOUT ITS DATES, on the server pinned at Thursday, October 22, 2026, 00:30
 * UTC (01:30 in London): every expected word comes from that instant (pinned.ts), so none of it
 * depends on what time the suite happens to run.
 */
test.use({ timezoneId: 'Europe/London' })

const patch = async (page: Page, id: string, fields: object) => {
  const res = await page.request.patch(`/api/v1/tasks/${id}`, { headers: WEB, data: fields })
  expect(res.ok(), await res.text()).toBe(true)
}
const task = async (page: Page, projectId: string, title: string, fields: object) => {
  const made = await apiPost(page, '/tasks', { projectId, title, parentId: null })
  await patch(page, made.id, fields)
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

test('a parent due today is a row of today’s, with its progress where a status would be', async ({
  page,
}) => {
  await registerFreshUser(page)
  const project = await apiPost(page, '/projects', { name: 'Job hunt' })
  const made = (title: string, parentId: string | null) =>
    apiPost(page, '/tasks', { projectId: project.id, title, parentId })
  const amazon = await made('Amazon', null)
  const sde = await made('SDE II', amazon.id)
  await made('System design round', amazon.id)
  const lawyer = await made('Find a lawyer', null)
  await made('Call two firms', lawyer.id)
  // 18:00 today in London, and today with no time of its own (23:59).
  await patch(page, amazon.id, { dueAt: '2026-10-22T17:00:00Z' })
  await patch(page, lawyer.id, { dueAt: '2026-10-22T22:59:00Z' })
  await patch(page, sde.id, { status: 'done' })
  await page.goto('/today')

  const amazonRow = row(page, 'Planned for today', 'Amazon')
  await expect(amazonRow.getByRole('img', { name: '50% done' })).toBeVisible()
  await expect(amazonRow.locator('[data-row-mark]')).toHaveText('Due today')
  // Its status is its children's: there is nothing here to change it with.
  await expect(amazonRow.getByRole('button', { name: /“Amazon”$/ })).toHaveCount(0)
  await expect(
    row(page, 'Planned for today', 'Find a lawyer').getByRole('img', { name: '0% done' }),
  ).toBeVisible()
  // A time of its own puts it on the line as well; the end of the day does not.
  const flags = page
    .getByRole('region', { name: 'Timeline of the day' })
    .locator('[data-timeline-due]')
  await expect(flags).toHaveCount(1)
  await expect(flags).toContainText('Amazon')
  await expect(flags).toContainText('18:00')
})

test('a birthday is a row of who, the day and how far off, each in its column', async ({
  page,
}) => {
  await registerFreshUser(page)
  // Thursday the 29th: a week on from the pinned day.
  await apiPost(page, '/people', {
    name: '外婆',
    birthday: {
      calendar: 'solar',
      month: 10,
      day: 29,
      year: null,
      leapMonth: false,
      remindLead: 7,
    },
  })
  await page.goto('/today')
  const birthday = page
    .getByRole('region', { name: 'Birthdays', exact: true })
    .locator('[data-birthday-row]')
  await expect(birthday).toContainText('外婆')
  await expect(birthday.locator('[data-birthday-day]')).toHaveText('Thu, Oct 29')
  await expect(birthday.locator('[data-birthday-in]')).toHaveText('7 d')
})
