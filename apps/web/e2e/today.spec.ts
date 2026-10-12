import { expect, test, type Page } from '@playwright/test'
import { TZDate } from '@date-fns/tz'
import {
  accountZone,
  apiPost,
  dayInZone,
  editDetail,
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

test('an in-progress task appears in the banner', async ({ page }) => {
  await registerFreshUser(page)
  await captureAndOpen(page, '写 M2b')
  await setDetailStatus(page, 'In progress')
  await page.getByRole('button', { name: 'Save' }).click()

  await page.getByRole('link', { name: 'Today' }).click()
  await expect(page.getByRole('region', { name: 'In progress' }).getByText('写 M2b')).toBeVisible()
})

// The segments are decided by the server precisely so this cannot happen (Review Focus 2); this
// asserts the page does not undo that by rendering a task into several sections.
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
 * Since the workbench, the three segments go to three DIFFERENT panels rather than three sections
 * of one column, and the panel order is the design's rather than anything derived from a list
 * inside the page. So this pins two things instead of one: - the panel order of the workbench
 * itself, including the panels that are not segments; and - that each segment's task lands in its
 * own panel AND IN NO OTHER, which is the assertion the old section-order test was really
 * protecting (a task matching several segments rendering twice reads as "did I create this
 * twice?").
 */
test('each segment goes to its own panel, in the workbench order, and to only one', async ({
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

  // It left the banner -- and it turned up under "Done today" without a reload, which is the other half of
  // the same claim now that the workbench has a panel for finished work. (A bare "the text is
  // gone from the page" would now be false, and would have been hiding this.)
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

  const moved = page.waitForResponse((r) => r.url().includes('/move') && r.ok())
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
  await page.route('**/api/v1/tasks/today', (route) =>
    route.fulfill({ status: 500, json: { title: 'boom' } }),
  )
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
 * 「Working on」一条和五条不是同一件事。
 *
 * 一条时它是这一页的焦点，顶一级字号花在它身上；五条时没有哪一条是「那一件」，它就是一份清单，
 * 于是字号落回行的那一级 —— 五行 24px 是一堵墙，不是重点。
 *
 * 它也和 Today 同宽：原来它横跨整页而下面的清单只有两栏，于是 Done 和 Pause 被甩到一千九百像素
 * 开外，离它们作用的那一行比离窗口边还远。
 */
test('正在做的只有一条时是焦点，多条时是清单', async ({ page }) => {
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
  expect(crowded, '五条时落回行的字号').toBeLessThan(alone)

  // 和 Today 那一栏同宽：按钮就在内容旁边，不在窗口边上。
  const [doing, today] = await Promise.all([
    page.getByRole('region', { name: 'In progress' }).boundingBox(),
    page.getByRole('region', { name: 'Today' }).boundingBox(),
  ])
  expect(Math.round(doing!.x + doing!.width)).toBe(Math.round(today!.x + today!.width))
})

test('做一件事时 Done 是那一下，做五件时它只是一行上的按钮', async ({ page }) => {
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
    `/api/v1/meetings/calendar?from=${dayInZone(account)}&to=${dayInZone(account)}`,
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
  // Midnight is past at every hour of the day, so this does not depend on when it runs.
  await meetingToday(page, 'Early call', '00:00', account)
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
