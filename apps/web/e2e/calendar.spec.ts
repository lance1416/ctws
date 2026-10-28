import { expect, test, type Page } from '@playwright/test'
import { TZDate } from '@date-fns/tz'
import { dayAfter, dayOffset } from './days'
import {
  accountZone,
  apiPost,
  dayInZone,
  makeProject,
  makeTask,
  registerFreshUser,
  WEB,
} from './helpers'

/**
 * THE CALENDAR -- the shell surface that is about every module at once, on the real clock: what
 * holds whatever day it is. The month of artboard 13 itself is `calendar.pinned.spec.ts`.
 *
 * The grid belongs to the SHELL and the contents to the modules: each puts its dated things on
 * it, and the shell draws them by what the date is to the thing.
 */

const square = (page: Page, day: string) => page.locator(`[data-day="${day}"]`)

test('a task planned and due lands twice: counted on one day, named on the other', async ({
  page,
}) => {
  // They are different facts about the same task, and a grid that showed one would silently drop
  // the other. A day's planned tasks are only counted (FR-080).
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, 'CTWS')
  await makeTask(page, pid, '发版', {
    scheduledOn: dayOffset(1),
    dueAt: `${dayOffset(4)}T09:00:00.000Z`,
  })
  await page.goto(`/calendar?day=${dayOffset(1)}`)

  await expect(square(page, dayOffset(1))).toContainText('1 planned')
  await expect(square(page, dayOffset(1))).not.toContainText('发版')
  await expect(square(page, dayOffset(4))).toContainText('发版')
})

test('the months step, and Today comes back', async ({ page }) => {
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, 'CTWS')
  await makeTask(page, pid, '这个月的', { dueAt: `${dayOffset(1)}T09:00:00.000Z` })
  await page.goto('/calendar')
  await expect(square(page, dayOffset(1))).toContainText('这个月的')

  // Two months forward is far enough that the day cannot still be on the grid as a neighbour.
  await page.getByRole('button', { name: 'Next month' }).click()
  await page.getByRole('button', { name: 'Next month' }).click()
  await expect(square(page, dayOffset(1))).toHaveCount(0)

  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await expect(square(page, dayOffset(1))).toContainText('这个月的')
})

test('a finished thing leaves the grid, because the calendar is about what is ahead', async ({
  page,
}) => {
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, 'CTWS')
  const id = await makeTask(page, pid, '做完的', { dueAt: `${dayOffset(1)}T09:00:00.000Z` })
  await page.goto('/calendar')
  await expect(square(page, dayOffset(1))).toContainText('做完的')

  await page.request.patch(`/api/v1/tasks/${id}`, { headers: WEB, data: { status: 'done' } })
  await page.reload()
  await expect(square(page, dayOffset(1))).not.toContainText('做完的')
})

test('a birthday sits on the day the server gives, and clicking it opens the person', async ({
  page,
}) => {
  await registerFreshUser(page)
  // A solar birthday today is always on this month's grid. Lunar dates are pinned by the core and
  // API tests; this checks the grid draws the day the server gives.
  const [, month, day] = dayOffset(0).split('-').map(Number) as [number, number, number]
  await apiPost(page, '/people', {
    name: '周楠',
    birthday: { calendar: 'solar', year: 1991, month, day },
  })

  await page.goto('/calendar')
  await expect(square(page, dayOffset(0))).toContainText('周楠')
  await square(page, dayOffset(0)).getByRole('link', { name: /周楠/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: '周楠' })).toBeVisible()
})

/**
 * THE GRID KEEPS TO THE SCALE. Every size in a square is one of the scale's steps, every colour a
 * whole token (no faded `/70`), and an entry is named with its project, whose square shows only
 * initials.
 */
test('the calendar grid keeps to the type scale', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await registerFreshUser(page)
  const pid = await makeProject(page, '找工作')
  await makeTask(page, pid, '交材料', { dueAt: `${dayOffset(0)}T12:00:00.000Z` })
  await makeTask(page, pid, '计划的', { scheduledOn: dayOffset(0) })
  await apiPost(page, '/meetings', {
    title: 'Call Tokyo',
    startsLocal: `${dayOffset(0)}T12:00`,
    timeZone: 'Asia/Tokyo',
    durationMinutes: 30,
    projectId: pid,
  })
  await page.goto('/calendar')
  await expect(page.locator('[data-day]').getByText('交材料')).toBeVisible()

  const found = await page.locator('[data-day]').evaluateAll((squares) => {
    const sizes = new Set<string>()
    const faded: string[] = []
    for (const sq of squares)
      for (const el of sq.querySelectorAll<HTMLElement>('*')) {
        if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3)) continue
        const s = getComputedStyle(el)
        sizes.add(s.fontSize)
        // Any alpha below 1, whatever the colour space: Tailwind v4 writes `text-x/70` as a
        // color-mix that the browser reports as `oklab(... / 0.7)`, not as rgba.
        if (/\/\s*0?\.\d+\)$|rgba\(.*,\s*0?\.\d+\)$/.test(s.color)) faded.push(el.textContent ?? '')
      }
    return { sizes: [...sizes], faded }
  })
  expect(
    found.sizes.every((s) => ['11px', '12px', '13px', '15px'].includes(s)),
    found.sizes.join(),
  ).toBe(true)
  expect(found.faded).toEqual([])
  await expect(
    page.locator('[data-day]').getByRole('link', { name: /交材料/ }),
  ).toHaveAccessibleName(/找工作/)
})

test('an open calendar moves today past midnight', async ({ page }) => {
  await registerFreshUser(page, '/')
  const zone = await accountZone(page)
  const today = dayInZone(zone)
  const [y, m, d] = today.split('-').map(Number) as [number, number, number]
  await page.clock.install({ time: new TZDate(y, m - 1, d, 23, 59, 58, 0, zone) })
  await page.goto('/calendar')
  const mark = (day: string) => square(page, day).locator('[aria-current="date"]')
  await expect(mark(today)).toHaveCount(1)
  await page.clock.runFor(5_000)
  await expect(mark(dayAfter(today))).toHaveCount(1)
  await expect(mark(today)).toHaveCount(0)
})

test('clicking a deadline on the grid opens its task', async ({ page }) => {
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, 'CTWS')
  const today = dayInZone(await accountZone(page))
  const task = await makeTask(page, pid, '配色重做', { dueAt: `${today}T12:00:00.000Z` })
  await page.goto('/calendar')

  await square(page, today)
    .getByRole('link', { name: /配色重做/ })
    .click()
  await expect(page).toHaveURL(`/projects/${pid}?task=${task}`)
  await expect(page.getByRole('dialog', { name: 'Task details' })).toContainText('配色重做')
})
