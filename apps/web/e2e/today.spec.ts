import { expect, test, type Locator, type Page } from '@playwright/test'
import { TZDate } from '@date-fns/tz'
import {
  accountZone,
  apiPost,
  dayInZone,
  editDetail,
  makeProject,
  makeTask,
  meetingToday,
  registerFreshUser,
  serverTask,
} from './helpers'
import { addDaysYmd, dayOffset, dueAgo, nextMondayYmd } from './days'

/**
 * TODAY (FR-079, artboard 12, STORY-034): the timeline across the top; In progress, Planned for
 * today and Overdue on the left in one set of columns (DES-001 section 4); Ready to start, This
 * week and Birthdays on the right.
 */

const block = (page: Page, name: string) => page.getByRole('region', { name, exact: true })
const rowOf = (scope: Locator, title: string) =>
  scope.getByRole('listitem').filter({ hasText: title })

/** The browser's clock at `hh:mm` today on the account's clock. */
async function clockAt(page: Page, hh: number, mm: number) {
  const zone = await accountZone(page)
  const [y, m, d] = dayInZone(zone).split('-').map(Number) as [number, number, number]
  await page.clock.install({ time: new TZDate(y, m - 1, d, hh, mm, 0, 0, zone) })
}

test('a new account sees its day with nothing planned, not an error (FR-030)', async ({ page }) => {
  await registerFreshUser(page)
  await expect(page.locator('#today-heading')).toBeVisible()
  await expect(block(page, 'Planned for today')).toContainText('Nothing yet')
  // The left column's blocks stand in a fixed order and are not drawn empty (FR-079).
  await expect(block(page, 'In progress')).toHaveCount(0)
  await expect(block(page, 'Overdue')).toHaveCount(0)
  await expect(block(page, 'Birthdays')).toContainText('None to be told about today')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('with nothing planned, what could start is offered, each with Plan (FR-030)', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  await makeTask(page, pid, '量一下尺寸')
  await page.reload()
  const planned = block(page, 'Planned for today')
  await expect(planned).toContainText('Nothing yet')
  await planned.getByRole('button', { name: 'Plan “量一下尺寸” for today' }).click()
  // Planned now, as a row of the list; and no longer offered.
  await expect(rowOf(planned, '量一下尺寸').locator('[data-today-row]')).toBeVisible()
  await expect(planned).not.toContainText('Nothing yet')
  expect((await serverTask(page, pid, '量一下尺寸')).scheduledOn).toBe(
    dayInZone(await accountZone(page)),
  )
})

test('each task is in one block, and the blocks stand in the board’s order', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  await makeTask(page, pid, '甲在做', { status: 'in_progress' })
  await makeTask(page, pid, '乙今天', { scheduledOn: dayOffset(0) })
  await makeTask(page, pid, '丙逾期', { dueAt: dueAgo(3) })
  // In progress and late both: late wins, and it is shown once.
  await makeTask(page, pid, '丁又逾期又在做', { status: 'in_progress', dueAt: dueAgo(2) })
  await page.reload()
  await expect(block(page, 'Birthdays')).toBeVisible()
  await expect(page.locator('[data-today-row]')).toHaveCount(4)

  expect(
    await page
      .getByRole('region')
      .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label'))),
  ).toEqual([
    'Timeline of the day',
    'In progress',
    'Planned for today',
    'Overdue',
    'Ready to start',
    'This week',
    'Birthdays',
  ])
  for (const [title, name] of [
    ['甲在做', 'In progress'],
    ['乙今天', 'Planned for today'],
    ['丙逾期', 'Overdue'],
    ['丁又逾期又在做', 'Overdue'],
  ] as const) {
    await expect(rowOf(block(page, name), title)).toHaveCount(1)
    await expect(page.locator('[data-today-row]').filter({ hasText: title })).toHaveCount(1)
  }
})

test('the three lists share one set of columns (DES-001 section 4)', async ({ page }) => {
  // Lance's screenshot of 2026-10-21 is the counter-example: each list had its own columns.
  await page.setViewportSize({ width: 1440, height: 900 })
  await registerFreshUser(page)
  const pid = await makeProject(page, '对齐')
  const parent = await makeTask(page, pid, '一个很长很长的父任务名字，长到会被截断')
  await makeTask(page, pid, '在做的', { status: 'in_progress', dueAt: dueAgo(-1) }, parent)
  await makeTask(page, pid, '计划的', { scheduledOn: dayOffset(-3) })
  await makeTask(page, pid, '逾期的', { dueAt: dueAgo(7) })
  await page.reload()
  await expect(page.locator('[data-today-row]')).toHaveCount(3)
  const lefts = async (sel: string) =>
    page.locator(`[data-today-row]`).evaluateAll(
      (rows, s) =>
        rows.map((r) => {
          const cell = r.closest('li')!.querySelector(s)
          return cell ? Math.round(cell.getBoundingClientRect().left) : null
        }),
      sel,
    )
  // Title, path and mark start on one line in every block, whatever a row lacks.
  for (const sel of ['[data-row-title]', '[data-row-path]']) {
    const xs = await lefts(sel)
    expect(new Set(xs).size, `${sel} at ${xs.join(', ')}`).toBe(1)
  }
  const marks = (await lefts('[data-row-mark]')).filter((x) => x !== null)
  expect(marks.length).toBe(2)
  expect(new Set(marks).size).toBe(1)
  // No time label and no colour bar in front of the status (FR-004, DES-001 section 4).
  await expect(page.locator('main [data-row-lead]')).toHaveCount(0)
})

test('an overdue row becomes a plan with one press: Today, Tomorrow, Mon or a day picked', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '逾期')
  const due = dueAgo(2)
  for (const t of ['改到今天', '改到明天', '改到周一', '另选一天'])
    await makeTask(page, pid, t, { dueAt: due })
  await page.reload()
  const overdue = block(page, 'Overdue')

  await overdue.getByRole('button', { name: 'Plan “改到明天” for tomorrow' }).click()
  await expect(rowOf(overdue, '改到明天')).toHaveCount(0)
  // A plan, not a new deadline (FR-079): the deadline stays, and tomorrow it is on Planned.
  const tomorrow = await serverTask(page, pid, '改到明天')
  expect(tomorrow.scheduledOn).toBe(dayOffset(1))
  expect(Date.parse(tomorrow.dueAt!)).toBe(Date.parse(due))

  await overdue.getByRole('button', { name: 'Plan “改到今天” for today' }).click()
  await expect(rowOf(block(page, 'Planned for today'), '改到今天')).toBeVisible()
  await expect(rowOf(overdue, '改到今天')).toHaveCount(0)

  await overdue.getByRole('button', { name: 'Plan “改到周一” for next Monday' }).click()
  await expect(rowOf(overdue, '改到周一')).toHaveCount(0)
  expect((await serverTask(page, pid, '改到周一')).scheduledOn).toBe(nextMondayYmd())

  const later = addDaysYmd(dayOffset(0), 9)
  await overdue.getByRole('button', { name: 'Plan “另选一天” for another day' }).click()
  for (let i = 0; i < 2; i++) {
    const cell = page.getByRole('button', { name: later, exact: true })
    if (await cell.isVisible()) break
    await page.getByRole('button', { name: 'Next month' }).click()
  }
  await page.getByRole('button', { name: later, exact: true }).click()
  await expect(overdue).toHaveCount(0)
  expect((await serverTask(page, pid, '另选一天')).scheduledOn).toBe(later)
})

test('past five overdue, the head moves them all, and All N shows the rest', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '一堆')
  for (let i = 1; i <= 7; i++) await makeTask(page, pid, `逾期${i}`, { dueAt: dueAgo(i) })
  await page.reload()
  const overdue = block(page, 'Overdue')
  await expect(overdue.locator('[data-today-row]')).toHaveCount(5)
  await overdue.getByRole('button', { name: 'All 7' }).click()
  await expect(overdue.locator('[data-today-row]')).toHaveCount(7)
  await overdue.getByRole('button', { name: /^Move all to/ }).click()
  await page.getByRole('menuitem', { name: 'Tomorrow' }).click()
  await expect(overdue).toHaveCount(0)
  // Plans only: every deadline stays where it was (FR-079).
  for (let i = 1; i <= 7; i++) {
    const moved = await serverTask(page, pid, `逾期${i}`)
    expect(moved.scheduledOn).toBe(dayOffset(1))
    expect(moved.dueAt).not.toBeNull()
  }
})

test('the timeline: now, the free stretch, the meeting with Join and the timed deadline', async ({
  page,
}) => {
  await registerFreshUser(page)
  const zone = await accountZone(page)
  await meetingToday(page, 'Stripe: first screen', '14:00', zone, 45, 'https://zoom.us/j/123')
  const pid = await makeProject(page, '时间轴')
  const [y, m, d] = dayInZone(zone).split('-').map(Number) as [number, number, number]
  await makeTask(page, pid, 'Prepare the system design round', {
    dueAt: new TZDate(y, m - 1, d, 18, 0, 0, 0, zone).toISOString(),
  })
  await clockAt(page, 9, 10)
  await page.reload()

  const line = page.getByRole('region', { name: 'Timeline of the day' })
  await expect(line.locator('[data-now-line]')).toContainText('Now, 09:10')
  await expect(line.locator('[data-free]')).toHaveText('4h 50m free')
  const meeting = line.locator('[data-timeline-meeting]')
  await expect(meeting).toContainText('Stripe: first screen')
  await expect(meeting).toContainText('14:00')
  await expect(meeting.getByRole('link', { name: 'Join' })).toHaveAttribute(
    'href',
    'https://zoom.us/j/123',
  )
  const flag = line.locator('[data-timeline-due]')
  await expect(flag).toContainText('Prepare the system design round')
  await expect(flag).toContainText('18:00')
  // The heading says the time too, in figures.
  await expect(page.locator('[data-now-clock]')).toHaveText('09:10')
})

test('the now line moves with the clock, and Join goes once the meeting is over', async ({
  page,
}) => {
  await registerFreshUser(page)
  const zone = await accountZone(page)
  await meetingToday(page, 'Design review', '10:00', zone, 60, 'https://meet.example/abc')
  await clockAt(page, 10, 30)
  await page.reload()
  const line = page.getByRole('region', { name: 'Timeline of the day' })
  await expect(line.locator('[data-now-line]')).toContainText('Now, 10:30')
  // On now: nothing free until it ends.
  await expect(line.locator('[data-free]')).toHaveCount(0)
  await expect(line.getByRole('link', { name: 'Join' })).toBeVisible()
  await page.clock.fastForward('01:00:00')
  await expect(line.locator('[data-now-line]')).toContainText('Now, 11:30')
  await expect(line.getByRole('link', { name: 'Join' })).toHaveCount(0)
})

test('meetings too close to draw apart are one node that lists them, by key as well', async ({
  page,
}) => {
  await registerFreshUser(page)
  const zone = await accountZone(page)
  for (const [title, at] of [
    ['Standup one', '13:00'],
    ['Standup two', '13:10'],
    ['Standup three', '13:20'],
  ] as const)
    await meetingToday(page, title, at, zone)
  await page.reload()

  const cluster = page.getByRole('button', { name: '3 meetings, 13:00–13:20' })
  const list = page.getByRole('list', { name: '3 meetings' })
  await expect(list).toHaveCount(0)
  // Reached like any control, opened with Enter, and each meeting is a link of its own.
  await cluster.focus()
  await page.keyboard.press('Enter')
  await expect(cluster).toHaveAttribute('aria-expanded', 'true')
  for (const title of ['Standup one', 'Standup two', 'Standup three'])
    await expect(list.getByRole('link', { name: title })).toBeVisible()
  await expect(list).toContainText('13:10')
  await page.keyboard.press('Escape')
  await expect(list).toHaveCount(0)
  await expect(cluster).toHaveAttribute('aria-expanded', 'false')
})

test('the timeline says so when the meetings cannot be read, instead of a free day', async ({
  page,
}) => {
  await registerFreshUser(page)
  await meetingToday(page, 'Stripe: first screen', '14:00', await accountZone(page))
  const calendar = '**/api/v1/meetings?view=calendar*'
  await page.route(calendar, (r) => r.fulfill({ status: 500, body: '{}' }))
  await page.reload()
  const line = page.getByRole('region', { name: 'Timeline of the day' })
  await expect(line).toContainText('Couldn’t load the timeline.')
  await expect(line.locator('[data-free]')).toHaveCount(0)
  // Only the timeline: the task blocks are there as ever (FR-032).
  await expect(block(page, 'Planned for today')).toBeVisible()

  await page.unroute(calendar)
  await line.getByRole('button', { name: 'Try again' }).click()
  await expect(line.locator('[data-timeline-meeting]')).toContainText('Stripe: first screen')
  await expect(line).not.toContainText('Couldn’t load')
})

test('the page takes its width in columns: half for the tasks, the rest beside them', async ({
  page,
}) => {
  await registerFreshUser(page)
  const grid = page.locator('[data-today-columns]')
  const share = async () => {
    const [tasks, all] = await Promise.all([
      block(page, 'Planned for today').evaluate((el) => el.getBoundingClientRect().width),
      grid.evaluate((el) => el.getBoundingClientRect().width),
    ])
    return tasks / all
  }
  // DES-001 section 4: 1440 is 2 and 1, 1920 is 2 and 2, 2560 is 3 and 3 (artboards 12, 31).
  for (const [width, columns, side, tasks] of [
    [1440, 3, 1, 2 / 3],
    [1920, 4, 2, 1 / 2],
    [2560, 6, 3, 1 / 2],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 })
    await expect(grid).toHaveAttribute('data-today-columns', String(columns))
    await expect(page.locator('[data-today-side]')).toHaveCount(side)
    expect(Math.abs((await share()) - tasks)).toBeLessThan(0.02)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    )
  }
})

test('the timeline runs 08 to 20 and reaches out to anything earlier', async ({ page }) => {
  await registerFreshUser(page)
  const zone = await accountZone(page)
  await meetingToday(page, 'Early call', '07:00', zone)
  await page.reload()
  const line = page.getByRole('region', { name: 'Timeline of the day' })
  await expect(line).toContainText('07')
  await expect(line).toContainText('20')
})

test('the head names the day, its lunar day with its month, and the time', async ({ page }) => {
  await registerFreshUser(page)
  const today = dayInZone(await accountZone(page))
  const [, , d] = today.split('-').map(Number) as [number, number, number]
  const month = new Date(`${today}T12:00:00Z`).toLocaleString('en-GB', {
    month: 'long',
    timeZone: 'UTC',
  })
  await expect(page.locator('#today-heading')).toContainText(`${month} ${d}`)
  // "九月十三": the month is said with the day, not the day alone.
  await expect(page.locator('[data-lunar-day]')).toHaveText(/月/)
})

test('In progress finishes with its check; the status mark finishes too, and says what it does', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '完成')
  await makeTask(page, pid, '做完它', { status: 'in_progress' })
  await makeTask(page, pid, '也做完', { scheduledOn: dayOffset(0) })
  await page.reload()
  await page.getByRole('button', { name: 'Mark “做完它” done' }).click()
  await expect(block(page, 'In progress')).toHaveCount(0)
  expect((await serverTask(page, pid, '做完它')).status).toBe('done')
  await page.getByRole('button', { name: 'Complete “也做完”' }).click()
  await expect(rowOf(block(page, 'Planned for today'), '也做完')).toHaveCount(0)
})

test('a row opens its task, and an edit there shows on Today without a reload', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '编辑')
  await makeTask(page, pid, '旧名字', { scheduledOn: dayOffset(0) })
  await page.reload()
  await page.locator('[data-today-row]').filter({ hasText: '旧名字' }).click()
  await editDetail(page)
  await page.getByLabel('Title').fill('新名字')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(rowOf(block(page, 'Planned for today'), '新名字')).toBeVisible()
})

test('a nested task says the task it is under, beside its project’s square', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '外层项目')
  const parent = await makeTask(page, pid, '父任务')
  await makeTask(page, pid, '子任务', { scheduledOn: dayOffset(0) }, parent)
  await page.reload()
  const path = rowOf(block(page, 'Planned for today'), '子任务').locator('[data-row-path]')
  await expect(path).toHaveText(/父任务$/)
  await expect(path.locator('[data-project-square]')).toHaveAttribute('data-project-square', pid)
})

test('Ready to start offers what waits for nothing and is not on Today already', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '可开始')
  await makeTask(page, pid, '可以开始的')
  await makeTask(page, pid, '已经计划的', { scheduledOn: dayOffset(0) })
  await page.reload()
  const ready = block(page, 'Ready to start')
  await expect(ready).toContainText('可以开始的')
  await expect(ready).not.toContainText('已经计划的')
  await ready.getByRole('button', { name: 'Start “可以开始的”' }).click()
  await expect(rowOf(block(page, 'In progress'), '可以开始的')).toBeVisible()
  await expect(ready).not.toContainText('可以开始的')
})

test('This week counts what each project closed, and says when one has gone quiet', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '本周')
  await makeTask(page, pid, '做完的', { status: 'done' })
  await makeTask(page, pid, '还开着的')
  await page.reload()
  const week = block(page, 'This week')
  const row = week.locator(`[data-week-row="${pid}"]`)
  await expect(row.getByLabel('1 closed this week')).toBeVisible()
  // The inbox is not a line of work.
  await expect(week).not.toContainText('Inbox')
})

test('a failed read is said in its block, and the rest of the page keeps working', async ({
  page,
}) => {
  await registerFreshUser(page)
  await page.route('**/api/v1/tasks?view=today', (r) => r.fulfill({ status: 500, body: '{}' }))
  await page.reload()
  await expect(page.getByText('Couldn’t load the tasks for today.')).toBeVisible()
  await expect(block(page, 'Birthdays')).toBeVisible()
})

test('an open Today asks the server again when the day turns', async ({ page }) => {
  await registerFreshUser(page)
  const zone = await accountZone(page)
  const [y, m, d] = dayInZone(zone).split('-').map(Number) as [number, number, number]
  await page.clock.install({ time: new TZDate(y, m - 1, d, 23, 59, 58, 0, zone) })
  await page.goto('/today')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  const asked = (view: string) =>
    page.waitForRequest((r) => new URL(r.url()).searchParams.get('view') === view)
  const again = Promise.all([asked('today'), asked('ready'), asked('movement')])
  await page.clock.runFor(5_000)
  await again
})

test('on a narrow screen the rows keep the title and drop the path and mark', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await registerFreshUser(page)
  const pid = await makeProject(page, '窄屏')
  await makeTask(page, pid, '窄屏上一条很长很长的任务标题也不应该把页面撑宽', { dueAt: dueAgo(2) })
  await page.reload()
  const row = page.locator('[data-today-row]').first()
  await expect(row).toBeVisible()
  await expect(page.locator('[data-row-path]').first()).toBeHidden()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('a birthday whose reminder has come round is listed', async ({ page }) => {
  await registerFreshUser(page)
  const tomorrow = dayOffset(1)
  const [, m, d] = tomorrow.split('-').map(Number) as [number, number, number]
  await apiPost(page, '/people', {
    name: '外婆',
    birthday: { calendar: 'solar', month: m, day: d, year: null, leapMonth: false, remindLead: 7 },
  })
  await page.reload()
  await expect(block(page, 'Birthdays').locator('[data-birthday-row]')).toContainText('外婆')
})
