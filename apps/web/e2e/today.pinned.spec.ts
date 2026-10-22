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

test('a late task given a day keeps its deadline, waits for that day, and is late on it', async ({
  page,
}) => {
  await registerFreshUser(page)
  const project = await apiPost(page, '/projects', { name: '申请' })
  // FR-079's example: due Thursday the 15th, a week late on the 22nd.
  const due = '2026-10-15T11:00:00Z'
  await task(page, project.id, '交申请', { dueAt: due })
  await task(page, project.id, '交材料', { dueAt: due })
  // Given yesterday, and not done: back in Overdue, not carried like a plain plan.
  await task(page, project.id, '交照片', { dueAt: due, scheduledOn: '2026-10-21' })
  await page.goto('/today')

  await expect(row(page, 'Overdue', '交照片').locator('[data-row-mark]')).toHaveText('7 days late')
  await expect(row(page, 'Overdue', '交照片')).not.toContainText('Carried')

  await row(page, 'Overdue', '交申请')
    .getByRole('button', { name: /for tomorrow$/ })
    .click()
  await expect(row(page, 'Overdue', '交申请')).toHaveCount(0)
  await row(page, 'Overdue', '交材料')
    .getByRole('button', { name: /for today$/ })
    .click()
  // On its day it is today's plan, and still says how late it is.
  await expect(row(page, 'Planned for today', '交材料').locator('[data-row-mark]')).toHaveText(
    '7 days late',
  )
  await expect(row(page, 'Planned for today', '交材料')).not.toContainText('Carried')

  const listed = await page.request.get(`/api/v1/tasks?projectId=${project.id}`)
  const tasks = (await listed.json()).tasks as {
    title: string
    dueAt: string
    scheduledOn: string
  }[]
  const of = (title: string) => tasks.find((t) => t.title === title)!
  expect([Date.parse(of('交申请').dueAt), of('交申请').scheduledOn]).toEqual([
    Date.parse(due),
    '2026-10-23',
  ])
  expect([Date.parse(of('交材料').dueAt), of('交材料').scheduledOn]).toEqual([
    Date.parse(due),
    '2026-10-22',
  ])
})

test('a parent by its deadline: a row of today’s or overdue, with its progress square', async ({
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
  const flat = await made('Flat deposit', null)
  await made('Find the receipt', flat.id)
  // 18:00 today in London; today with no time of its own (23:59); and yesterday's.
  await patch(page, amazon.id, { dueAt: '2026-10-22T17:00:00Z' })
  await patch(page, lawyer.id, { dueAt: '2026-10-22T22:59:00Z' })
  await patch(page, flat.id, { dueAt: '2026-10-21T17:00:00Z' })
  await patch(page, sde.id, { status: 'done' })
  await page.goto('/today')

  // Half done, so half full; one child done, so the parent is under way, and green (artboard 32).
  const amazonRow = row(page, 'Planned for today', 'Amazon')
  const square = amazonRow.getByRole('img', { name: 'In progress, 1 of 2 done' })
  await expect(square).toHaveAttribute('data-progress-square', '50')
  await expect(amazonRow.locator('[data-row-mark]')).toHaveText('Due today')
  await expect(amazonRow.locator('[data-row-children]')).toHaveText('1/2')
  // Its status is its children's: there is nothing here to change it with.
  await expect(amazonRow.getByRole('button', { name: /“Amazon”/ })).toHaveCount(0)
  await expect(
    row(page, 'Planned for today', 'Find a lawyer').getByRole('img', {
      name: 'To do, 0 of 1 done',
    }),
  ).toBeVisible()

  // Missed, it is overdue like a leaf, but it has no plan to be given a day.
  const flatRow = row(page, 'Overdue', 'Flat deposit')
  await expect(flatRow.locator('[data-row-mark]')).toHaveText('1 day late')
  await expect(flatRow.locator('[data-row-children]')).toHaveText('0/1')
  await expect(flatRow.getByRole('button', { name: /^Plan “Flat deposit”/ })).toHaveCount(0)

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

test('deadlines at the same moment are one flag that lists them, never a meeting', async ({
  page,
}) => {
  await registerFreshUser(page)
  const project = await apiPost(page, '/projects', { name: '同一刻' })
  // Both at 18:00 in London.
  await task(page, project.id, 'Send the onsite availability', { dueAt: '2026-10-22T17:00:00Z' })
  await task(page, project.id, 'Sign the lease', { dueAt: '2026-10-22T17:00:00Z' })
  await page.goto('/today')

  const line = page.getByRole('region', { name: 'Timeline of the day' })
  await expect(line.locator('[data-timeline-meeting]')).toHaveCount(0)
  const flag = line.getByRole('button', { name: '2 deadlines, 18:00' })
  await flag.focus()
  await page.keyboard.press('Enter')
  const list = page.getByRole('list', { name: '2 deadlines' })
  await expect(list).toContainText('Send the onsite availability')
  await expect(list).toContainText('Sign the lease')
})
