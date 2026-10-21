import { expect, test, type Page } from '@playwright/test'
import { TZDate } from '@date-fns/tz'
import { dayAfter, dayOffset } from './days'
import {
  accountZone,
  apiPost,
  dayInZone,
  makeProject,
  makeReading,
  makeTask,
  registerFreshUser,
  WEB,
} from './helpers'

/**
 * THE CALENDAR -- the shell surface that is about every module at once.
 *
 * The claim worth testing is not that a grid renders: it is that the grid belongs to the SHELL
 * and the contents belong to the modules. Two modules put things on it, each with its own word
 * for what the date means, and the shell neither knows nor says which is which.
 */

const square = (page: Page, day: string) => page.locator(`[data-day="${day}"]`)

const book = (page: Page, title: string, planOn: string) =>
  makeReading(page, { kind: 'book', title }, { planOn })

test('both modules put their dated things on one grid', async ({ page }) => {
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, 'CTWS')
  await makeTask(page, pid, '配色重做', { scheduledOn: dayOffset(1) })
  await book(page, '设计心理学', dayOffset(2))
  await page.goto('/calendar')

  await expect(square(page, dayOffset(1))).toContainText('配色重做')
  await expect(square(page, dayOffset(2))).toContainText('设计心理学')
})

test('one task with a plan and a deadline lands on two squares', async ({ page }) => {
  // They are different facts about the same task, and a grid that showed one would silently drop
  // the other.
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, 'CTWS')
  await makeTask(page, pid, '发版', {
    scheduledOn: dayOffset(1),
    dueAt: `${dayOffset(4)}T09:00:00.000Z`,
  })
  await page.goto('/calendar')

  await expect(square(page, dayOffset(1))).toContainText('发版')
  await expect(square(page, dayOffset(4))).toContainText('发版')
})

test('the view tabs show one module at a time', async ({ page }) => {
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, 'CTWS')
  await makeTask(page, pid, '配色重做', { scheduledOn: dayOffset(1) })
  await book(page, '设计心理学', dayOffset(1))
  await page.goto('/calendar')

  await page.getByRole('tab', { name: 'Reading' }).click()
  await expect(square(page, dayOffset(1))).toContainText('设计心理学')
  await expect(square(page, dayOffset(1))).not.toContainText('配色重做')

  // The chosen view is in the URL, so a reload lands where the person was.
  await expect(page).toHaveURL(/view=reading/)
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Reading' })).toHaveAttribute('aria-selected', 'true')

  await page.getByRole('tab', { name: 'All' }).click()
  await expect(square(page, dayOffset(1))).toContainText('配色重做')
})

test('a crowded square says how many it is not showing', async ({ page }) => {
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, 'CTWS')
  for (const title of ['一件', '二件', '三件', '四件', '五件']) {
    await makeTask(page, pid, title, { scheduledOn: dayOffset(1) })
  }
  await page.goto('/calendar')

  // Three, then the count. A square that grew with its contents would break the grid.
  await expect(square(page, dayOffset(1)).getByRole('link')).toHaveCount(3)
  await expect(square(page, dayOffset(1))).toContainText('+2')
})

test('the months step, and This month comes back', async ({ page }) => {
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, 'CTWS')
  await makeTask(page, pid, '这个月的', { scheduledOn: dayOffset(1) })
  await page.goto('/calendar')
  await expect(square(page, dayOffset(1))).toContainText('这个月的')

  // Two months forward is far enough that the day cannot still be on the grid as a neighbour.
  await page.getByRole('button', { name: 'Next month' }).click()
  await page.getByRole('button', { name: 'Next month' }).click()
  await expect(square(page, dayOffset(1))).toHaveCount(0)

  await page.getByRole('button', { name: 'Back to this month' }).click()
  await expect(square(page, dayOffset(1))).toContainText('这个月的')
})

test('a finished thing leaves the grid, because the calendar is about what is ahead', async ({
  page,
}) => {
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, 'CTWS')
  const id = await makeTask(page, pid, '做完的', { scheduledOn: dayOffset(1) })
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
  await expect(page.getByRole('dialog', { name: 'People' })).toContainText('周楠')
})

test('a square shows the lunar day the server gives', async ({ page }) => {
  await registerFreshUser(page)
  const today = dayOffset(0)
  const answer = await page.request.get(`/api/v1/calendar/days?from=${today}&to=${today}`, {
    headers: WEB,
  })
  expect(answer.ok()).toBe(true)
  const label = ((await answer.json()) as { days: Record<string, string> }).days[today]
  expect(label).toBeTruthy()

  await page.goto('/calendar')
  await expect(square(page, today).locator('[data-lunar-day]')).toHaveText(label!)
})

/**
 * THE GRID KEEPS TO THE SCALE. Every size in a square is one of the scale's steps -- no 10px zone
 * and no 11px lunar day -- every colour is a whole token (no faded `/70`), and an entry's project
 * mark is square, the thread's shape, not a pill.
 */
test('the calendar grid keeps to the type scale and the thread shape', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await registerFreshUser(page)
  const pid = await makeProject(page, '找工作')
  await makeTask(page, pid, '交材料', { scheduledOn: dayOffset(0) })
  // Agreed in another zone, so the square carries the zone beside the time.
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
    found.sizes.every((s) => ['12px', '14px', '16px'].includes(s)),
    found.sizes.join(),
  ).toBe(true)
  expect(found.faded).toEqual([])
  const mark = page.locator('[data-entry-mark]').first()
  await expect(mark).toHaveCSS('border-radius', '0px')
  // The colour is never without the project's name: the entry is named with it.
  await expect(
    page.locator('[data-day]').getByRole('link', { name: /交材料/ }),
  ).toHaveAccessibleName(/找工作/)
})

/*
  THE KEY. A square has no room for a project's name, so on the grid an entry's colour would be
  the only sign of its project (WCAG 1.4.1). One line under the month names them once: every
  project whose colour is on the grid, its mark and its name, in the rail's order.
*/
test('a key under the month names each project whose colour is on the grid', async ({ page }) => {
  await registerFreshUser(page, '/')
  const job = await makeProject(page, '找工作')
  const ctws = await makeProject(page, 'CTWS')
  // CTWS is met first on the grid; the key still follows the rail.
  await makeTask(page, ctws, '发版', { scheduledOn: dayOffset(1) })
  await makeTask(page, job, '交材料', { scheduledOn: dayOffset(2) })
  await page.goto('/calendar')

  const key = page.getByRole('list', { name: 'Projects on this calendar' })
  await expect(key.getByRole('listitem')).toHaveText(['找工作', 'CTWS'])
  const colour = (el: Element) => getComputedStyle(el).backgroundColor
  for (const [name, title] of [
    ['找工作', '交材料'],
    ['CTWS', '发版'],
  ] as const) {
    const onEntry = await page
      .locator('[data-day]')
      .getByRole('link', { name: new RegExp(title) })
      .locator('[data-entry-mark]')
      .evaluate(colour)
    const inKey = await key
      .getByRole('listitem')
      .filter({ hasText: name })
      .locator('[data-key-mark]')
      .evaluate(colour)
    expect(inKey, name).toBe(onEntry)
  }
})

test('an entry folded into "+N" puts no project in the key', async ({ page }) => {
  // The key names the colours ON the grid; a project whose only entry is not drawn has none there.
  await registerFreshUser(page, '/')
  const shown = await makeProject(page, 'Shown')
  const folded = await makeProject(page, 'Folded')
  for (const title of ['a1', 'a2', 'a3'])
    await makeTask(page, shown, title, { scheduledOn: dayOffset(1) })
  await makeTask(page, folded, 'z9', { scheduledOn: dayOffset(1) })
  await page.goto('/calendar')

  await expect(square(page, dayOffset(1))).toContainText('+1')
  await expect(
    page.getByRole('list', { name: 'Projects on this calendar' }).getByRole('listitem'),
  ).toHaveText(['Shown'])
})

test('with no project colour on the grid there is no key', async ({ page }) => {
  await registerFreshUser(page, '/')
  await book(page, '设计心理学', dayOffset(1))
  await page.goto('/calendar')
  await expect(square(page, dayOffset(1))).toContainText('设计心理学')
  await expect(page.getByRole('list', { name: 'Projects on this calendar' })).toHaveCount(0)
})

test('an open calendar moves today past midnight', async ({ page }) => {
  await registerFreshUser(page, '/')
  const zone = await accountZone(page)
  const today = dayInZone(zone)
  const [y, m, d] = today.split('-').map(Number) as [number, number, number]
  await page.clock.install({ time: new TZDate(y, m - 1, d, 23, 59, 58, 0, zone) })
  await page.goto('/calendar')
  const mark = (day: string) => page.locator(`[data-day="${day}"] > div`).first()
  await expect(mark(today)).toHaveClass(/font-medium/)
  await page.clock.runFor(5_000)
  await expect(mark(dayAfter(today))).toHaveClass(/font-medium/)
  await expect(mark(today)).not.toHaveClass(/font-medium/)
})

test('clicking a task or a reading item on the grid opens that one', async ({ page }) => {
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, 'CTWS')
  const today = dayInZone(await accountZone(page))
  const task = await makeTask(page, pid, '配色重做', { scheduledOn: today })
  const item = await book(page, '设计心理学', today)
  await page.goto('/calendar')

  await square(page, today)
    .getByRole('link', { name: /配色重做/ })
    .click()
  await expect(page).toHaveURL(`/projects/${pid}?task=${task}`)
  await expect(page.getByRole('dialog', { name: 'Task details' })).toContainText('配色重做')

  await page.goto('/calendar')
  await square(page, today)
    .getByRole('link', { name: /设计心理学/ })
    .click()
  await expect(page).toHaveURL(`/reading/${item}`)
  await expect(page.getByRole('dialog', { name: 'Reading' })).toContainText('设计心理学')
})
