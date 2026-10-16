import { expect, test, type Page } from '@playwright/test'
import { TZDate } from '@date-fns/tz'
import {
  accountZone,
  apiPost,
  dayInZone,
  editDetail,
  isMove,
  makeProject,
  makeTask,
  meetingToday,
  openProject,
  registerFreshUser,
  setDetailStatus,
  submitCreate,
  WEB,
} from './helpers'

async function captureAndOpen(page: Page, title: string) {
  await submitCreate(page, 'Capture…', title)
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Projects' })
    .click()
  await openProject(page, 'Inbox')
  await page.getByRole('listitem').filter({ hasText: title }).click()
  // The pane opens in reading mode; every test here is about an edit.
  await editDetail(page)
}

test('a freshly registered user sees an empty today page, not an error', async ({ page }) => {
  await registerFreshUser(page)
  // `level: 1` because "Done today" is a heading on this page too, and getByRole matches names by
  // substring: without it this would be ambiguous the moment anything is finished today.
  await expect(page.locator('#today-heading')).toBeVisible()
  await expect(page.getByText('Nothing for today')).toBeVisible()
})

test('scheduling a task through the detail panel puts it on the today page', async ({ page }) => {
  await registerFreshUser(page)
  await captureAndOpen(page, '改简历')

  // Today in the browser's own timezone, which is also the timezone registration recorded.
  const today = new Date().toLocaleDateString('en-CA')
  await page.getByLabel('Plan', { exact: true }).fill(today)
  await page.getByRole('button', { name: 'Save' }).click()

  await page.getByRole('link', { name: 'Today' }).click()
  // `exact` because "Done today" is also a region whose name contains "Today".
  const section = page.getByRole('region', { name: 'Today', exact: true })
  await expect(section.getByText('改简历')).toBeVisible()
  // The breadcrumb says where it lives, so the list is usable without opening anything.
  await expect(section.getByText('Inbox')).toBeVisible()
  // With something scheduled, the empty-state line must be gone, not shown beside the list.
  await expect(page.getByText('Nothing for today')).toHaveCount(0)
})

// The server puts each task in one segment; this asserts the page does not undo that by rendering a
// task into several sections.
test('a task that is both overdue and in progress is shown once', async ({ page }) => {
  await registerFreshUser(page)
  await captureAndOpen(page, '又逾期又在做')
  await setDetailStatus(page, 'In progress')
  await page.getByLabel('Due', { exact: true }).fill('2020-01-01T00:00')
  await page.getByRole('button', { name: 'Save' }).click()
  // Wait for the save to land before navigating, the way the saves above this one do. Without it
  // the test races its own PATCH, which leaves Overdue simply absent. The pane returns to
  // reading rather than closing, so Edit coming back is the signal.
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Today' }).click()
  // Wait for the list to be on screen before counting: while the route is still switching the
  // project page's own row is in the DOM, and a count taken then passes without proving anything.
  await expect(
    page.getByRole('region', { name: 'Overdue' }).getByText('又逾期又在做'),
  ).toBeVisible()
  await expect(page.getByText('又逾期又在做')).toHaveCount(1)
})

/**
 * The three segments go to three different panels, in the page's own order. This pins the panel
 * order, including the panels that are not segments, and that each segment's task lands in its own
 * panel AND IN NO OTHER: a task rendered twice reads as "did I create this twice?".
 */
test("each segment goes to its own panel, in the page's order, and to only one", async ({
  page,
}) => {
  await registerFreshUser(page)
  const today = new Date().toLocaleDateString('en-CA')

  // Created in the reverse of display order so insertion order cannot explain a pass.
  await captureAndOpen(page, '甲在做')
  await setDetailStatus(page, 'In progress')
  await page.getByRole('button', { name: 'Save' }).click()
  // Saving returns the pane to reading rather than closing it, so this steps out explicitly.
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await submitCreate(page, 'Capture…', '乙今天')
  await page.getByRole('listitem').filter({ hasText: '乙今天' }).click()
  await editDetail(page)
  await page.getByLabel('Plan', { exact: true }).fill(today)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await submitCreate(page, 'Capture…', '丙逾期')
  await page.getByRole('listitem').filter({ hasText: '丙逾期' }).click()
  await editDetail(page)
  await page.getByLabel('Due', { exact: true }).fill('2020-01-01T00:00')
  await page.getByRole('button', { name: 'Save' }).click()
  // Wait for the save to land before navigating, the way the saves above this one do. Without it
  // the test races its own PATCH, which leaves Overdue simply absent. The pane returns to
  // reading rather than closing, so Edit coming back is the signal.
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Today' }).click()
  await expect(page.locator('#today-heading')).toBeVisible()
  // This week is in this list too: the set is the PAGE's sections, not the segment list. "Done
  // today" is absent because nothing was finished -- a section with nothing to say is not drawn.
  expect(
    await page.locator('[data-panel]').evaluateAll((els) => els.map((el) => el.dataset.panel)),
  ).toEqual(['In progress', 'Today', 'Overdue', 'This week'])

  for (const [title, panel] of [
    ['甲在做', 'In progress'],
    ['乙今天', 'Today'],
    ['丙逾期', 'Overdue'],
  ] as const) {
    await expect(
      page.getByRole('region', { name: panel, exact: true }).getByText(title),
    ).toHaveCount(1)
    // And nowhere else on the page: one task, one panel.
    await expect(page.getByText(title)).toHaveCount(1)
  }
})

test('an edit made from the today page is reflected without a reload', async ({ page }) => {
  await registerFreshUser(page)
  await captureAndOpen(page, '先在做')
  await setDetailStatus(page, 'In progress')
  await page.getByRole('button', { name: 'Save' }).click()

  await page.getByRole('link', { name: 'Today' }).click()
  await page.getByRole('region', { name: 'In progress' }).getByText('先在做').click()
  await editDetail(page)
  await setDetailStatus(page, 'Done')
  await page.getByRole('button', { name: 'Save' }).click()

  // It left the banner -- and it turned up under "Done today" without a reload.
  await expect(
    page.getByRole('region', { name: 'In progress', exact: true }).getByText('先在做'),
  ).toHaveCount(0)
  await expect(
    page.getByRole('region', { name: 'Done today', exact: true }).getByText('先在做'),
  ).toBeVisible()
  await expect(page.getByText('Nothing for today')).toBeVisible()
  // The panel unmounted without being closed; focus must not have fallen to <body>.
  await expect(page.locator('#today-heading')).toBeFocused()
})

// The breadcrumb is what makes the list usable without opening anything; a nested task must show
// where it sits, not only which project it is in.
test('a nested task shows both its project and its parent in the breadcrumb', async ({ page }) => {
  await registerFreshUser(page)
  await submitCreate(page, 'Capture…', '父任务')
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Projects' })
    .click()
  await openProject(page, 'Inbox')
  await submitCreate(page, 'Capture…', '子任务')
  await expect(page.getByRole('listitem')).toHaveCount(2)

  const moved = page.waitForResponse((r) => isMove(r.request()) && r.ok())
  await page.getByRole('button', { name: 'Task: 子任务' }).focus()
  await page.keyboard.press('Alt+ArrowRight')
  await moved

  await page.getByRole('listitem').filter({ hasText: '子任务' }).click()
  await editDetail(page)
  await setDetailStatus(page, 'In progress')
  await page.getByRole('button', { name: 'Save' }).click()

  await page.getByRole('link', { name: 'Today' }).click()
  const section = page.getByRole('region', { name: 'In progress' })
  await expect(section.getByText('子任务')).toBeVisible()
  await expect(section.getByText('Inbox › 父任务')).toBeVisible()
})

// A failed fetch must not read as "nothing to do": that would tell the user they are free when the
// app simply could not ask.
test('a failed fetch shows an error, not the empty-state line', async ({ page }) => {
  const todayView = (url: URL) =>
    url.pathname === '/api/v1/tasks' && url.searchParams.get('view') === 'today'
  await page.route(todayView, (route) => route.fulfill({ status: 500, json: { title: 'boom' } }))
  await registerFreshUser(page)
  await expect(page.getByRole('alert')).toHaveText('boom')
  await expect(page.getByText('Nothing for today')).toHaveCount(0)
})

// The overdue date is for reading, not for a form: a relative label, with the exact local time on
// hover. The datetime-local wire format ("2026-10-01T09:00") must never reach the screen.
test('an overdue task shows a relative label, not the datetime-local format', async ({ page }) => {
  await registerFreshUser(page)
  await captureAndOpen(page, '交报告')
  await page.getByLabel('Due', { exact: true }).fill('2020-01-01T09:00')
  await page.getByRole('button', { name: 'Save' }).click()

  await page.getByRole('link', { name: 'Today' }).click()
  const section = page.getByRole('region', { name: 'Overdue' })
  // The day it was due is the margin, flagged; the exact moment is the margin's title; how late is
  // the note on the right; the line under the title says where.
  const row = section.locator('li').filter({ hasText: '交报告' })
  await expect(row.locator('[data-row-lead-text]')).toHaveText('Jan 1')
  await expect(row.locator('[data-row-lead]')).toHaveAttribute('title', 'Due Jan 1, 2020, 09:00')
  await expect(row.locator('[data-row-note]')).toHaveText(/^\d+ days? late$/)
  await expect(row.locator('[data-row-meta]')).toHaveText('Inbox')
  await expect(section).not.toContainText(/\d{4}-\d{2}-\d{2}T/)
  await expect(section).not.toContainText('T09:00')
})

test('the status dot has a text alternative', async ({ page }) => {
  await registerFreshUser(page)
  await captureAndOpen(page, '写 M2b')
  await setDetailStatus(page, 'In progress')
  await page.getByRole('button', { name: 'Save' }).click()

  await page.getByRole('link', { name: 'Today' }).click()
  await expect(
    page.getByRole('region', { name: 'In progress' }).getByRole('img', { name: 'In progress' }),
  ).toBeVisible()
})

/**
 * One task in progress is the page's focus and gets the largest type; several are a list at row
 * size, since five 24px lines are a wall rather than an emphasis.
 */
test('one task in progress is the focus, several are a list', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await registerFreshUser(page)
  const p = await apiPost(page, '/projects', { name: 'P' })
  const pid = p.id as string
  await apiPost(page, '/tasks', { title: '只在做这一件', projectId: pid, status: 'in_progress' })
  await page.goto('/tasks/today')

  const size = (sel: string) =>
    page
      .locator(sel)
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  const alone = await size('[data-doing-title]')

  await apiPost(page, '/tasks', { title: '第二件', projectId: pid, status: 'in_progress' })
  await apiPost(page, '/tasks', { title: '第三件', projectId: pid, status: 'in_progress' })
  await page.reload()
  const crowded = await size('[data-doing-title]')
  expect(crowded, 'with three in progress the title falls back to the row size').toBeLessThan(alone)

  // As wide as the Today column, so the buttons sit beside the content, not at the window edge.
  const [doing, today] = await Promise.all([
    page.getByRole('region', { name: 'In progress' }).boundingBox(),
    page.getByRole('region', { name: 'Today' }).boundingBox(),
  ])
  expect(Math.round(doing!.x + doing!.width)).toBe(Math.round(today!.x + today!.width))
})

/**
 * The one thing being done is the line this page is for: on a phone it is said in full, on as
 * many lines as it takes, not cut to the dozen characters a 36px line leaves beside its mark.
 */
test('on a phone the one thing in progress is said in full', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await registerFreshUser(page)
  const p = await apiPost(page, '/projects', { name: 'P' })
  const title = 'Ship the Daybook redesign and redraw the canvas'
  await apiPost(page, '/tasks', { title, projectId: p.id as string, status: 'in_progress' })
  await page.goto('/tasks/today')
  const subject = page.locator('[data-doing-title]')
  await expect(subject).toHaveText(title)
  const cut = await subject.evaluate((el) => el.scrollWidth > el.clientWidth)
  expect(cut, 'the title runs past its box').toBe(false)
  // And on more than one line, which is what saying it in full takes at this width.
  const lines = await subject.evaluate(
    (el) => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight),
  )
  expect(lines).toBeGreaterThanOrEqual(2)
})

test('with one task in progress Done is the main action, with several it is a button on a row', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await registerFreshUser(page)
  const p = await apiPost(page, '/projects', { name: 'P' })
  const pid = p.id as string
  await apiPost(page, '/tasks', { title: '只在做这一件', projectId: pid, status: 'in_progress' })
  await page.goto('/tasks/today')
  const fill = () =>
    page
      .getByRole('button', { name: /^Complete/ })
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor)
  const alone = await fill()

  await apiPost(page, '/tasks', { title: '第二件', projectId: pid, status: 'in_progress' })
  await apiPost(page, '/tasks', { title: '第三件', projectId: pid, status: 'in_progress' })
  await page.reload()
  await expect(page.getByRole('button', { name: /^Complete/ })).toHaveCount(3)
  expect(await fill(), '三条时不再是填实的那一个').not.toBe(alone)
})

// ------------------------------------------------------------------------------- the day's line

test('a meeting sits on the day at your own time, and says the zone it was agreed in', async ({
  page,
}) => {
  await registerFreshUser(page)
  const account = await accountZone(page)
  // Any zone that is not the account's, with no clock change near today's date, so the label is
  // the same whatever day this runs.
  const zone = account === 'Asia/Tokyo' ? 'Asia/Kolkata' : 'Asia/Tokyo'
  await meetingToday(page, 'Northwind intro call', '12:00', zone)
  const entries = await page.request.get(
    `/api/v1/meetings?view=calendar&from=${dayInZone(account)}&to=${dayInZone(account)}`,
    { headers: WEB },
  )
  const [entry] = ((await entries.json()) as { entries: { zone: string | null }[] }).entries
  expect(entry?.zone, 'the server names the zone').toBeTruthy()

  await page.goto('/tasks/today')
  const row = page
    .getByRole('region', { name: 'Today', exact: true })
    .locator('[data-day-entry]')
    .filter({ hasText: 'Northwind intro call' })
  await expect(row.locator('[data-row-lead-text]')).toHaveText('12:00')
  await expect(row.locator('[data-entry-zone]')).toHaveText(entry!.zone!)
})

test('a meeting already over is drawn a step quieter, above the now line', async ({ page }) => {
  await registerFreshUser(page)
  const account = await accountZone(page)
  await meetingToday(page, 'Early call', '00:00', account)
  // Read at 15:00, so the half-hour from midnight is over whenever this runs.
  const [y, m, d] = dayInZone(account).split('-').map(Number) as [number, number, number]
  await page.clock.setFixedTime(new TZDate(y, m - 1, d, 15, 0, 0, 0, account))
  await page.goto('/tasks/today')
  const row = page.locator('[data-day-entry]').filter({ hasText: 'Early call' })
  const subtle = await page.evaluate(() => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--color-ink-subtle)'
    document.body.append(probe)
    const c = getComputedStyle(probe).color
    probe.remove()
    return c
  })
  await expect(row.locator('[data-row-title]')).toHaveCSS('color', subtle)
  const now = (await page.locator('[data-now-line]').boundingBox())!
  expect((await row.boundingBox())!.y).toBeLessThan(now.y)
})

test('with nothing timed today there is no now line', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '今天随时做', { scheduledOn: dayInZone(await accountZone(page)) })
  await page.goto('/tasks/today')
  const row = page.locator('li').filter({ has: page.locator('[data-today-row]') })
  await expect(row).toHaveCount(1)
  await expect(page.locator('[data-now-line]')).toHaveCount(0)
  // The untimed rows begin with the word for them.
  await expect(row.locator('[data-row-lead-text]')).toHaveText('Any time')
})

test('a task due today at a time is on the line once, at its time', async ({ page }) => {
  await registerFreshUser(page)
  const account = await accountZone(page)
  const pid = await makeProject(page, 'P')
  const [y, m, d] = dayInZone(account).split('-').map(Number) as [number, number, number]
  await makeTask(page, pid, '下午交的', {
    dueAt: new TZDate(y, m - 1, d, 16, 0, 0, 0, account).toISOString(),
  })
  await page.goto('/tasks/today')
  const line = page.getByRole('region', { name: 'Today', exact: true })
  await expect(line.getByText('下午交的')).toHaveCount(1)
  await expect(page.getByText('下午交的')).toHaveCount(1)
  await expect(
    line.locator('li').filter({ hasText: '下午交的' }).locator('[data-row-lead-text]'),
  ).toHaveText('16:00')
  // Something is timed, so the day has a now.
  await expect(page.locator('[data-now-line]')).toHaveCount(1)
})

/**
 * NOW MOVES, AND A MEETING IS OVER WHEN IT ENDS. A Today left open keeps its now line on the
 * clock; and at 10:30 the 10:00–11:00 meeting is the one you are in, not one that has gone by.
 * The clock is the test's own, set to the account's today: nothing here rides on the hour the
 * suite happens to run at.
 */
test('the now line moves with the clock, and a meeting is past only once it has ended', async ({
  page,
}) => {
  await registerFreshUser(page)
  const zone = await accountZone(page)
  await meetingToday(page, 'Morning sync', '08:00', zone, 60)
  await meetingToday(page, 'Design review', '10:00', zone, 60)
  const [y, m, d] = dayInZone(zone).split('-').map(Number) as [number, number, number]
  await page.clock.install({ time: new TZDate(y, m - 1, d, 10, 30, 0, 0, zone) })
  await page.goto('/tasks/today')

  const tint = (title: string) =>
    page
      .locator('[data-day-entry]')
      .filter({ hasText: title })
      .locator('[data-row-title]')
      .evaluate((el) => getComputedStyle(el).color)
  await expect(page.locator('[data-now-line]')).toContainText('10:30')
  // Over (08:00–09:00) and under way (10:00–11:00) are not drawn alike.
  expect(await tint('Design review')).not.toBe(await tint('Morning sync'))

  // An hour later, with nothing done on the page: the line has moved, and the review is over.
  await page.clock.fastForward('01:00:00')
  await expect(page.locator('[data-now-line]')).toContainText('11:30')
  await expect.poll(() => tint('Design review')).toBe(await tint('Morning sync'))
})

/** Several things in progress are a list of rows: at 320px they fit, and nothing scrolls sideways. */
test('several things in progress fit a 320px phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await registerFreshUser(page)
  const p = await apiPost(page, '/projects', { name: 'P' })
  for (const title of ['第一件在做的', '第二件在做的'])
    await apiPost(page, '/tasks', { title, projectId: p.id as string, status: 'in_progress' })
  await page.goto('/tasks/today')
  await expect(page.locator('[data-doing-title]')).toHaveCount(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
})

/**
 * The controls that appear over a row's end on hover sit on an OPAQUE ground: through a
 * translucent one the end of the title is drawn under Pause, both legible at once and neither.
 */
test('the controls over a hovered row hide the title under them', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await registerFreshUser(page)
  const p = await apiPost(page, '/projects', { name: 'P' })
  for (const title of ['一件', '两件'])
    await apiPost(page, '/tasks', { title, projectId: p.id as string, status: 'in_progress' })
  await page.goto('/tasks/today')
  const row = page.locator('[data-doing-title]').first()
  await row.hover()
  const ground = await page
    .getByRole('button', { name: /^Pause/ })
    .first()
    .evaluate((el) => getComputedStyle(el.parentElement!).backgroundColor)
  // rgb(...) is opaque; rgba(..., a) with a < 1 is not.
  expect(ground).toMatch(/^rgb\(/)
})

test('an open Today asks the server again when the day turns', async ({ page }) => {
  await registerFreshUser(page)
  const zone = await accountZone(page)
  const [y, m, d] = dayInZone(zone).split('-').map(Number) as [number, number, number]
  await page.clock.install({ time: new TZDate(y, m - 1, d, 23, 59, 58, 0, zone) })
  await page.goto('/tasks/today')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  const asked = (view: string) =>
    page.waitForRequest((r) => new URL(r.url()).searchParams.get('view') === view)
  const again = Promise.all([asked('today'), asked('completed'), asked('movement')])
  await page.clock.runFor(5_000)
  await again
})
