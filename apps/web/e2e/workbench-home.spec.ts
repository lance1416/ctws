import { expect, test, type Page } from '@playwright/test'
import { TZDate } from '@date-fns/tz'
import {
  accountZone,
  apiPost,
  dayInZone,
  holdFirstRead,
  makeProject,
  makeReading,
  makeTask,
  meetingToday,
  registerFreshUser,
  WEB,
} from './helpers'

/**
 * THE WORKBENCH -- THE SHELL'S OWN FRONT PAGE.
 *
 * The claim under test is not that the page renders: it is that the page belongs to NOBODY, and
 * that its cards and the project pages do not show each other's rows. A workbench card that
 * repeated what is already on a project page would make two places to keep in your head.
 */

const card = (page: Page, name: string) => page.getByRole('region', { name, exact: true })

test('signing in lands on the workbench, not inside a module', async ({ page }) => {
  await registerFreshUser(page, '/')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Workbench', level: 1 })).toBeVisible()
  // Every module has a card here, and the shell has its own.
  await expect(card(page, 'Today')).toBeVisible()
  await expect(card(page, 'Reading')).toBeVisible()
  await expect(card(page, 'Projects')).toBeVisible()
})

test('the Reading card holds only what belongs to no project', async ({ page }) => {
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, 'CTWS')
  await apiPost(page, '/reading', { kind: 'book', title: '散着的书' })
  await makeReading(page, { kind: 'book', title: '归了项目的书' }, { projectId: pid })
  await page.goto('/')

  const reading = card(page, 'Reading')
  await expect(reading).toContainText('散着的书')
  // THE DIVISION OF LABOUR: what is filed under a project lives on that project's page, and this
  // card does not repeat it.
  await expect(reading).not.toContainText('归了项目的书')

  await page.goto(`/projects/${pid}`)
  await expect(page.getByText('归了项目的书')).toBeVisible()
  await expect(page.getByText('散着的书')).toHaveCount(0)
})

test('an item whose project was deleted turns up on the card rather than nowhere', async ({
  page,
}) => {
  // Projects are soft-deleted, so without this the item would be absent from every project page
  // AND from the card -- in the database and on no screen.
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, '要删掉的')
  await makeReading(page, { kind: 'book', title: '留下来的书' }, { projectId: pid })
  await page.request.delete(`/api/v1/projects/${pid}`, { headers: WEB })
  await page.goto('/')
  await expect(card(page, 'Reading')).toContainText('留下来的书')
})

test('the Today card shows what is in progress, across projects', async ({ page }) => {
  await registerFreshUser(page, '/')
  const a = await makeProject(page, 'CTWS')
  const b = await makeProject(page, 'rrgen')
  const task = (projectId: string, title: string, status?: string) =>
    makeTask(page, projectId, title, status ? { status } : {})
  await task(a, '配色重做', 'in_progress')
  await task(b, '跑通 CI', 'in_progress')
  await task(a, '还没开始的')
  await page.goto('/')

  const doing = card(page, 'Today')
  await expect(doing).toContainText('配色重做')
  await expect(doing).toContainText('跑通 CI')
  await expect(doing).not.toContainText('还没开始的')
  // Each row's thread is its project's colour, and the project is NAMED beside it: across
  // projects, a colour alone would leave a reader matching hues against the rail (WCAG 1.4.1).
  await expect(doing.getByRole('listitem').filter({ hasText: '配色重做' })).toContainText('CTWS')
  await expect(doing.getByRole('listitem').filter({ hasText: '跑通 CI' })).toContainText('rrgen')
})

// ------------------------------------------------------------------------- each card its shape

test('the cards are Today, Meetings, Reading, Birthdays and Projects, each heading its page', async ({
  page,
}) => {
  await registerFreshUser(page, '/')
  const cards = page.getByRole('main').locator('[data-panel]')
  await expect(cards).toHaveCount(5)
  expect(await cards.evaluateAll((els) => els.map((el) => el.getAttribute('data-panel')))).toEqual([
    'Today',
    'Meetings',
    'Reading',
    'Birthdays',
    'Projects',
  ])
  // A card's heading is the way to its page.
  for (const [name, to] of [
    ['Today', '/today'],
    ['Meetings', '/meetings'],
    ['Reading', '/reading'],
    ['Birthdays', '/people/birthdays'],
    ['Projects', '/projects'],
  ] as const)
    await expect(card(page, name).getByRole('heading').getByRole('link')).toHaveAttribute(
      'href',
      to,
    )
})

test('the Today card counts what is late, planned and done, and each count goes there', async ({
  page,
}) => {
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '晚了的', { dueAt: '2020-01-01T09:00:00.000Z' })
  // Today on the ACCOUNT's calendar, which is the one the card counts by.
  const day = dayInZone(await accountZone(page))
  await makeTask(page, pid, '今天的', { scheduledOn: day })
  await makeTask(page, pid, '做完的', { status: 'done' })
  await page.goto('/')
  const today = card(page, 'Today')
  await expect(today.getByRole('link', { name: '1 overdue' })).toHaveAttribute('href', '/today')
  await expect(today.getByRole('link', { name: '1 planned' })).toHaveAttribute('href', '/today')
  await expect(today.getByRole('link', { name: '1 done' })).toHaveAttribute(
    'href',
    '/review?view=done',
  )
})

test('the Meetings line names each meeting and what time it is now', async ({ page }) => {
  await registerFreshUser(page, '/')
  await meetingToday(page, 'Northwind intro call', '12:00', await accountZone(page))
  await page.goto('/')
  const line = card(page, 'Meetings').getByRole('img')
  await expect(line).toHaveAttribute('aria-label', /Northwind intro call at 12:00/)
  await expect(line).toHaveAttribute('aria-label', /It is \d{2}:\d{2}\./)
})

test('a meeting outside the line’s hours is listed under it, not dropped', async ({ page }) => {
  await registerFreshUser(page, '/')
  // 06:30 is before the line's 08:00, on the account's own clock, whatever day this runs.
  await meetingToday(page, 'Early standup', '06:30', await accountZone(page))
  await page.goto('/')
  const meetings = card(page, 'Meetings')
  await expect(meetings.getByRole('listitem').filter({ hasText: 'Early standup' })).toHaveCount(1)
  await expect(meetings.getByRole('img')).toHaveAttribute('aria-label', /Early standup at 06:30/)
})

test('a project line says what is open, what is late or due next, and when it moved', async ({
  page,
}) => {
  await registerFreshUser(page, '/')
  const late = await makeProject(page, '晚了的线')
  await makeTask(page, late, '一', { dueAt: '2020-01-01T09:00:00.000Z' })
  await makeTask(page, late, '二')
  const next = await makeProject(page, '有下一个的线')
  await makeTask(page, next, '三', { dueAt: '2099-03-04T09:00:00.000Z' })
  await page.goto('/')
  const line = (name: string) =>
    card(page, 'Projects').getByRole('listitem').filter({ hasText: name })
  await expect(line('晚了的线')).toContainText('2 open')
  await expect(line('晚了的线')).toContainText('1 overdue')
  await expect(line('晚了的线')).toContainText('Moved today')
  await expect(line('有下一个的线')).toContainText('1 open')
  await expect(line('有下一个的线')).toContainText('Due Mar 4, 2099')
})

/**
 * THE MEETINGS LINE, LATE AND AT ITS EDGES. At 21:50 on a phone the now label stays inside its
 * card; a meeting that starts before 08:00 and runs onto the line is drawn on it; one that runs
 * past midnight is drawn to the line's end, not as a sliver.
 */
test('the meetings line keeps late hours and long meetings inside the card', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await registerFreshUser(page)
  const zone = await accountZone(page)
  await meetingToday(page, 'Early run', '07:30', zone, 90)
  await meetingToday(page, 'Call home', '20:00', zone, 30)
  await meetingToday(page, 'Late session', '21:00', zone, 240)
  const day = dayInZone(zone)
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  await page.clock.install({ time: new TZDate(y, m - 1, d, 21, 50, 0, 0, zone) })
  await page.goto('/')

  const line = page.getByRole('img', { name: /^Today from 08:00/ })
  await expect(line).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
  // 07:30–09:00 overlaps the line, so it is on it -- not listed as outside its hours.
  await expect(line).toHaveAttribute('aria-label', /Early run at 07:30/)
  const name = (await line.getAttribute('aria-label'))!
  expect(name).not.toContain('Outside those hours')
  // 21:00 to past midnight is drawn from 21:00 to the line's end: 1 of its 14 hours.
  const share = await line.evaluate((el) => {
    const late = [...el.querySelectorAll<HTMLElement>('[data-line-meeting]')].find(
      (b) => b.dataset.lineMeeting === 'Late session',
    )!
    return late.getBoundingClientRect().width / el.getBoundingClientRect().width
  })
  expect(share).toBeGreaterThan(0.06)
})

test('a meeting on a project names it beside its colour', async ({ page }) => {
  await registerFreshUser(page, '/')
  const zone = await accountZone(page)
  const pid = await makeProject(page, '找工作')
  const day = dayInZone(zone)
  await apiPost(page, '/meetings', {
    title: 'Second interview',
    startsLocal: `${day}T12:00`,
    timeZone: zone,
    durationMinutes: 60,
    projectId: pid,
  })
  await page.goto('/')
  const row = card(page, 'Meetings').getByRole('listitem').filter({ hasText: 'Second interview' })
  await expect(row).toContainText('找工作')
})

/**
 * NOT A PICTURE OF NOTHING WHILE IT LOADS. Before the day's meetings arrive the card draws no line:
 * a line drawn empty is named "nothing", and a screen reader (or anyone glancing) is told a day
 * with meetings in it is empty.
 */
test('the meetings line is not drawn until the meetings are in', async ({ page }) => {
  await registerFreshUser(page, '/')
  await meetingToday(page, 'Call home', '20:00', await accountZone(page))
  const release = await holdFirstRead(page, '**/api/v1/meetings?*')
  await page.goto('/')
  await expect(card(page, 'Meetings')).toBeVisible()
  await expect(card(page, 'Meetings').getByRole('img')).toHaveCount(0)
  release()
  await expect(card(page, 'Meetings').getByRole('img')).toHaveAttribute(
    'aria-label',
    /Call home at 20:00/,
  )
})

test('an open workbench turns the day at midnight', async ({ page }) => {
  await registerFreshUser(page, '/')
  const zone = await accountZone(page)
  const projectId = await makeProject(page, 'Night shift')
  await makeTask(page, projectId, 'Moved just now')
  const [y, m, d] = dayInZone(zone).split('-').map(Number) as [number, number, number]
  await page.clock.install({ time: new TZDate(y, m - 1, d, 23, 59, 58, 0, zone) })
  await page.goto('/')
  await expect(page.getByText('Moved today')).toBeVisible()
  await page.clock.runFor(5_000)
  await expect(page.getByText('Moved yesterday')).toBeVisible()
})

test('a meeting moved to another day from the Meetings card stays open', async ({ page }) => {
  await registerFreshUser(page)
  const zone = await accountZone(page)
  await meetingToday(page, 'Movable', '12:00', zone)
  const [y, m, d] = dayInZone(zone).split('-').map(Number) as [number, number, number]
  const tomorrow = new TZDate(y, m - 1, d + 1, 12, 0, 0, 0, zone)
  const day = tomorrow.toLocaleDateString('en-CA', { timeZone: zone })
  await page.goto('/')
  await card(page, 'Meetings').getByRole('button', { name: 'Movable' }).click()
  const pane = page.getByRole('dialog', { name: 'Meetings' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  await pane.getByLabel('Start').fill(`${day}T12:00`)
  await pane.getByRole('button', { name: 'Save' }).click()
  await expect(pane.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
  await expect(pane).toContainText('Movable')
})
