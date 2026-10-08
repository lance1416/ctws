import { expect, test, type Page } from '@playwright/test'
import { editDetail, registerFreshUser } from './helpers'
import { dayOffset, nextMondayYmd, ymd } from './days'

/**
 * The row system (rows-and-reading, second edition): the project rail at x=0, the status marker, a
 * LEADING ICON SLOT, and a title that owns the whole line -- with the dates spelled out in full on
 * a second line under it.
 *
 * What these guards are for, in order of how easy it would be to fake:
 * - "the title is not truncated" is provable only by measuring `scrollWidth` against `clientWidth`
 *   on a REAL long title at the panel width the complaint was about. A short title fits every
 *   layout, and a placeholder string proves nothing.
 * - "the icons are a column" is NOT provable by asserting an icon is present. It is provable only
 *   by measuring the glyph on rows whose titles differ in length and finding it at one x.
 * - "the slot costs nothing when no row needs it" is provable only by measuring a list that has no
 *   icons against one that has.
 * - "the wording is complete" is provable only against the minute, because the mechanism this
 *   replaced compressed exactly that away.
 * - "the triage still does what it did" is provable only from the request body; the UI can agree
 *   with itself while sending nothing.
 *
 * The three mechanisms this edition deleted (the 8rem/11rem date columns, the stack threshold and
 * the derived list measure) are pinned ABSENT from the source at the end of this file: "we deleted
 * it" is the kind of claim that rots.
 */

const HEADERS = { 'x-ctws-client': 'web' }
const DAY = 86_400_000

const dueAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString()

async function makeProject(page: Page, name: string): Promise<string> {
  const res = await page.request.post('/api/v1/projects', { headers: HEADERS, data: { name } })
  expect(res.ok()).toBeTruthy()
  return ((await res.json()) as { id: string }).id
}

async function makeTask(
  page: Page,
  projectId: string,
  title: string,
  patch: Record<string, unknown> = {},
  parentId: string | null = null,
): Promise<string> {
  const res = await page.request.post('/api/v1/tasks', {
    headers: HEADERS,
    data: { projectId, title, parentId },
  })
  expect(res.ok()).toBeTruthy()
  const id = ((await res.json()) as { id: string }).id
  if (Object.keys(patch).length > 0) {
    const p = await page.request.patch(`/api/v1/tasks/${id}`, { headers: HEADERS, data: patch })
    expect(p.ok()).toBeTruthy()
  }
  return id
}

const isPatch = (r: { url: () => string; request: () => { method: () => string } }) =>
  /\/tasks\/[^/]+$/.test(r.url()) && r.request().method() === 'PATCH'
const patched = (page: Page) => page.waitForResponse((r) => isPatch(r) && r.ok())

const triage = (page: Page, title: string) =>
  page.getByRole('button', { name: `调整「${title}」的日期` })

/** Every x of a set of cells, rounded to the pixel: sub-pixel layout noise is not a column break. */
async function xs(page: Page, selector: string): Promise<number[]> {
  const boxes = await page
    .locator(selector)
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().x)))
  expect(boxes.length, `cells matching ${selector}`).toBeGreaterThan(1)
  return boxes
}

// ------------------------------------------------------------- the leading icons ARE the column

/** Every x of a set of elements, rounded to the pixel: sub-pixel layout noise is not a column break. */

/**
 * §6: 「行首图标在所有行上落在同一个 x」. On a flat list that is literally every row, whatever
 * its title length and whatever glyph it wears -- which is the whole point of a fixed slot, and the
 * claim the deleted date columns used to carry.
 */
test('on 今天, every row puts its leading icon at the same x', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  // Titles of wildly different lengths, and three different glyphs: a missed deadline, a deadline
  // still standing and a carried plan. Before the row system each date landed wherever its title
  // happened to end.
  await makeTask(page, pid, '短', { dueAt: dueAgo(2) })
  await makeTask(page, pid, '中等长度的一个标题', { dueAt: dueAgo(11) })
  await makeTask(page, pid, '一个非常非常非常非常非常长的标题用来把右边挤掉', { dueAt: dueAgo(4) })
  await page.goto('/')
  const section = page.getByRole('region', { name: '逾期' })
  await expect(section.locator('[data-lead-icon="missed"]')).toHaveCount(3)

  const icons = await xs(page, '[aria-label="逾期"] [data-lead-icon]')
  expect(new Set(icons).size, `icon x values: ${icons.join(',')}`).toBe(1)
  // The title starts at one x as well, so the eye lands in the same place on every line.
  const titles = await xs(page, '[aria-label="逾期"] [data-today-row]')
  expect(new Set(titles).size, `title column x values: ${titles.join(',')}`).toBe(1)
  // The icon is BEFORE the title, which is what "行首" means.
  expect(icons[0]!).toBeLessThan(titles[0]!)
})

/**
 * 今天 is two lists in two columns of one page (the queue and 逾期), and a glyph at one x on each
 * row of ITS OWN list is the claim -- the two panels are not one column. Three glyph kinds in one
 * list, because "one x" is easy to pass when every row wears the same icon.
 */
test('one list, one x, however many kinds of glyph are in it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const today = dayOffset(0)
  await makeTask(page, pid, '今天要做的第一件事，标题写得长些好看出宽度', { scheduledOn: today })
  await makeTask(page, pid, '今天截止的', {
    scheduledOn: today,
    dueAt: new Date(new Date().setHours(23, 30, 0, 0)).toISOString(),
  })
  await makeTask(page, pid, '顺延过来的', { scheduledOn: dayOffset(-4) })
  await page.goto('/')
  const queue = page.getByRole('region', { name: '今天', exact: true })
  await expect(queue.locator('[data-today-row]')).toHaveCount(3)
  // Two different glyphs in the one list, so this is not three copies of one row.
  await expect(queue.locator('[data-lead-icon="deadline"]')).toHaveCount(1)
  await expect(queue.locator('[data-lead-icon="plan"]')).toHaveCount(1)
  const icons = await xs(page, '[aria-label="今天"] [data-lead-icon]')
  expect(new Set(icons).size, `icon x values: ${icons.join(',')}`).toBe(1)
  // ...and the row that has nothing to say still reserves the slot, which is what holds the x.
  await expect(queue.locator('[data-lead-slot]')).toHaveCount(3)
})

/**
 * In the tree the row is indented, so the slot travels with its row's own level: that is the one
 * place §6's "the same x" cannot mean the window's x, because §2 puts the slot AFTER the status
 * marker and the marker has always moved with depth (the titles are deliberately not in one column
 * here either). What must hold -- and what the scan actually needs -- is that the slot's x depends
 * on the row's DEPTH and on nothing else: not on the title, not on the glyph, not on the date.
 */
test('in the project tree the icon slot moves with depth and with nothing else', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  // Three rows at depth 1 with titles and glyphs that differ in every way, then one child.
  await makeTask(page, pid, '短', { dueAt: dueAgo(3) })
  await makeTask(page, pid, '一条标题长得多的任务，用来证明标题长度不会挪动图标', {
    scheduledOn: dayOffset(4),
  })
  const c = await makeTask(page, pid, '有备注的', { notes: '先问清楚' })
  await makeTask(page, pid, '子任务，深一层', { dueAt: dueAgo(1) }, c)
  await page.goto(`/projects/${pid}`)
  await expect(page.locator('[data-task-tree] li[data-depth]')).toHaveCount(4)

  const at = (depth: string) =>
    page
      .locator(`[data-task-tree] li[data-depth="${depth}"] [data-lead-icon]`)
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().x)))
  const top = await at('1')
  expect(top, 'three glyphs at depth 1').toHaveLength(3)
  expect(new Set(top).size, `depth-1 icon x values: ${top.join(',')}`).toBe(1)
  // Three DIFFERENT glyphs, so the x is not shared because the rows are identical.
  expect(
    await page
      .locator('[data-task-tree] li[data-depth="1"] [data-lead-icon]')
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.leadIcon)),
  ).toEqual(['missed', 'plan', 'notes'])
  // The child's glyph is one indent step to the right, and exactly one: the slot rides the row.
  const child = await at('2')
  expect(child[0]! - top[0]!, `depth 1 -> 2: ${top[0]} -> ${child[0]}`).toBe(20)
})

// ------------------------------------------------- the slot collapses, per WHOLE LIST (§2, §6)

/**
 * §6: 「整表无图标时图标槽不占位」. Measured against a list that DOES have the slot, not merely
 * counted: a reserved-but-empty box is invisible to a glyph count while taking 1.5rem off every
 * title in the list.
 */
test('a list where no row has an icon spends nothing on the slot', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await registerFreshUser(page)
  const bare = await makeProject(page, '无图标的线')
  await makeTask(page, bare, LONG_TITLE)
  const second = await makeTask(page, bare, '第二条，没有日期也没有备注')
  await makeTask(page, bare, '一条子任务，缩进一层', {}, second)
  await page.goto(`/projects/${bare}`)
  await expect(page.locator('[data-task-tree] li[data-depth]')).toHaveCount(3)

  // Not an empty box, not a zero-width one: nothing.
  await expect(page.locator('[data-task-tree] [data-lead-slot]')).toHaveCount(0)
  const without = await firstRow(page)
  expect(without.fits, `title needs ${without.needs}px of ${without.cell}px`).toBe(true)
  // A dateless, noteless list is a list of ONE-LINE rows: 44px, and no second line anywhere.
  expect(without.h, 'a row with nothing to say').toBe(44)
  await expect(page.locator('[data-task-tree] [data-row-meta]')).toHaveCount(0)

  // The same three titles in a list where ONE row has a note: the slot appears and takes exactly
  // its own width off the title cell. 28px = the 1.5rem slot plus the gap that separates it.
  const noted = await makeProject(page, '有一个图标的线')
  await makeTask(page, noted, LONG_TITLE)
  const s2 = await makeTask(page, noted, '第二条，没有日期也没有备注', { notes: '一句话' })
  await makeTask(page, noted, '一条子任务，缩进一层', {}, s2)
  await page.goto(`/projects/${noted}`)
  await expect(page.locator('[data-task-tree] [data-lead-slot]')).toHaveCount(3)
  const withSlot = await firstRow(page)
  expect(
    without.cell - withSlot.cell,
    `title cell ${without.cell}px with no slot, ${withSlot.cell}px with one`,
  ).toBe(28)
  // The LIST did not change width: one measure for every list now (§3's third deletion), so a list
  // that gains an icon does not gain or lose width.
  expect(withSlot.list, `list ${without.list}px -> ${withSlot.list}px`).toBe(without.list)
})

/**
 * The other end of the same rule, and the one that stops the first from being a regression: the
 * collapse is per WHOLE LIST, not per row and not per group. One row with a date makes the slot
 * exist for every row of the list, which is the only thing that holds the glyphs at one x.
 */
test('one dated row gives EVERY row in the list its slot, glyph or not', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await registerFreshUser(page)
  const pid = await makeProject(page, '混合的线')
  // Only the FIRST row has a deadline, only the LAST has a plan, and the rows sit at three depths.
  const a = await makeTask(page, pid, '只有这一条有截止时间', { dueAt: dueAgo(3) })
  const b = await makeTask(page, pid, '这一条什么日期都没有，而且标题相当长', {}, a)
  await makeTask(page, pid, '短', {}, b)
  await makeTask(page, pid, '只有这一条有排期', { scheduledOn: dayOffset(4) })
  await page.goto(`/projects/${pid}`)
  const rows = page.locator('[data-task-tree] li[data-depth]')
  await expect(rows).toHaveCount(4)
  expect(await rows.evaluateAll((els) => els.map((el) => el.dataset.depth))).toEqual([
    '1',
    '2',
    '3',
    '1',
  ])

  // One slot per row, filled or not.
  await expect(page.locator('[data-task-tree] [data-lead-slot]')).toHaveCount(4)
  // ...and the glyphs are only on the rows that have something: two of four, which is what makes
  // this a reserved slot rather than four rows that happen to agree.
  await expect(page.locator('[data-task-tree] [data-lead-icon]')).toHaveCount(2)
  await expect(page.locator('[data-task-tree] [data-lead-icon="missed"]')).toHaveCount(1)
  await expect(page.locator('[data-task-tree] [data-lead-icon="plan"]')).toHaveCount(1)
  // The empty slot is hidden from assistive technology: it is width, not information.
  expect(
    await page
      .locator('[data-task-tree] li[data-depth="2"] [data-lead-slot]')
      .getAttribute('aria-hidden'),
  ).toBe('true')
})

/**
 * 今天 is two lists in two columns of one page, so the rule is per list there too: a queue of
 * tasks planned for today carries no glyph at all (that is the ordinary case for that panel -- a
 * plan for today under a heading that says 今天 is not news), while 逾期 next to it does.
 */
test('on 今天 the queue and 逾期 each answer for their own slot', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const today = dayOffset(0)
  await makeTask(page, pid, '今天要做的第一件事，标题写得长些好看出宽度', { scheduledOn: today })
  await makeTask(page, pid, '今天要做的第二件事', { scheduledOn: today })
  await makeTask(page, pid, '一条逾期的', { dueAt: dueAgo(2) })
  await page.goto('/')
  const queue = page.getByRole('region', { name: '今天', exact: true })
  const late = page.getByRole('region', { name: '逾期' })
  await expect(queue.locator('[data-today-row]')).toHaveCount(2)
  await expect(late.locator('[data-today-row]')).toHaveCount(1)

  await expect(queue.locator('[data-lead-slot]')).toHaveCount(0)
  // Measured, not merely counted.
  const titleWidth = await queue
    .locator('[data-today-row]')
    .first()
    .evaluate((el) => Math.round(el.clientWidth))
  expect(titleWidth, `title track in the queue: ${titleWidth}px`).toBeGreaterThan(500)
  // 逾期 is a different list and keeps its slot, and one panel's collapse did not take the
  // other's glyph with it.
  await expect(late.locator('[data-lead-slot]')).toHaveCount(1)
  await expect(late.locator('[data-lead-icon="missed"]')).toHaveCount(1)
})

/**
 * The 逾期 panel is a one-third-width SUMMARY: the project and how late, and not the absolute
 * deadline or the plan. With them every row wrapped to three lines and truncated its title anyway.
 *
 * ONE test proves both halves, on ONE task: while its deadline is later today it sits in the main
 * 今天 queue and that row says the timestamp in full; once the deadline is two days gone the same
 * task sits in 逾期 and says only the project and 已逾 2 天. A test of the panel alone would be
 * satisfied by a global truncation, and the main queue half is what forbids one.
 *
 * The deadline is pinned at 12:34 local so the timestamp is a fixed string, not a function of when
 * the suite happens to run; "later today" holds at any hour because 今天 takes everything from the
 * start of the day.
 */
test('逾期 says the project and how late; the same task in the queue says the whole deadline', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await registerFreshUser(page)
  const pid = await makeProject(page, '邮件服务')
  const noon = new Date()
  noon.setHours(12, 34, 0, 0)
  const TITLE = '核对退信率并给收件人分组'
  const id = await makeTask(page, pid, TITLE, { dueAt: noon.toISOString() })
  await makeTask(page, pid, '另一条没有日期的', { scheduledOn: dayOffset(0) })

  await page.goto('/')
  const queue = page.getByRole('region', { name: '今天', exact: true })
  const late = page.getByRole('region', { name: '逾期' })
  const queueRow = queue.locator('li').filter({ hasText: TITLE })
  await expect(queueRow.locator('[data-row-meta]')).toContainText('12:34 截止')
  await expect(late).toHaveCount(0)

  // The same task, two days late (12:34 kept: only the day moves).
  const twoDaysAgo = new Date(noon.getTime() - 2 * DAY)
  twoDaysAgo.setHours(12, 34, 0, 0)
  const res = await page.request.patch(`/api/v1/tasks/${id}`, {
    headers: HEADERS,
    // A plan on another day too: the summary must not spend a line on it either.
    data: { dueAt: twoDaysAgo.toISOString(), scheduledOn: dayOffset(3) },
  })
  expect(res.ok()).toBeTruthy()
  await page.reload()

  const lateRow = late.locator('li').filter({ hasText: TITLE })
  const meta = lateRow.locator('[data-row-meta]')
  await expect(meta).toHaveText('邮件服务·已逾 2 天')
  await expect(lateRow.locator('[data-due-text]')).toHaveCount(0)
  await expect(lateRow.locator('[data-plan-text]')).toHaveCount(0)
  await expect(lateRow).not.toContainText('12:34')
  await expect(lateRow).not.toContainText('截止')
  // The deadline is not lost with the line: it is in the tooltip of the lateness phrase.
  await expect(lateRow.locator('[data-late-text]')).toHaveAttribute(
    'title',
    `${ymd(twoDaysAgo)} 12:34`,
  )
  // ...and the missed-deadline icon still leads the row.
  await expect(lateRow.getByRole('img', { name: '截止已过' })).toHaveCount(1)

  // A row in the one-third panel is no taller than the two-line metric: a title and ONE meta line.
  // The metric is measured, not typed: a queue row with a title and a project line, in this page.
  const height = (row: typeof lateRow) =>
    row.evaluate((el) => Math.round(el.getBoundingClientRect().height))
  const twoLines = await height(queue.locator('li').filter({ hasText: '另一条没有日期的' }))
  const h = await height(lateRow)
  expect(h, `逾期 row ${h}px against the two-line metric ${twoLines}px`).toBeLessThanOrEqual(
    twoLines,
  )
  expect(h, 'and it is not a one-line row by accident').toBeGreaterThan(50)
  const panelW = await late.evaluate((el) => Math.round(el.getBoundingClientRect().width))
  expect(panelW, 'this is the narrow panel').toBeLessThan(420)

  // The queue half, on the same task, in the same page, still unabridged: put it back in the queue
  // by moving the deadline to later today.
  const back = await page.request.patch(`/api/v1/tasks/${id}`, {
    headers: HEADERS,
    data: { dueAt: noon.toISOString() },
  })
  expect(back.ok()).toBeTruthy()
  await page.reload()
  await expect(queueRow.locator('[data-row-meta]')).toContainText('12:34 截止')
  await expect(queueRow.locator('[data-late-text]')).toHaveCount(0)
})

// ------------------------------------------------- the title owns the line, at every panel width

/**
 * A REAL, LONG title: 575px of text at 15px. A placeholder string would prove nothing, because the
 * bug is truncation and a short title fits every layout.
 */
const LONG_TITLE = '把邮件服务的 Connection timeout 查清楚，顺手给 SMTP 那边加上指数退避重试和告警'

/** The first tree row: how wide its title cell is, whether the title overflows it, and its height. */
const firstRow = (page: Page) =>
  page
    .locator('[data-task-tree] li[data-depth]')
    .first()
    .evaluate((li) => {
      const cell = li.querySelector('[data-row-cell]') as HTMLElement
      const title = li.querySelector('[data-row-title]') as HTMLElement
      return {
        cell: Math.round(cell.clientWidth),
        fits: title.scrollWidth <= title.clientWidth + 1,
        needs: Math.round(title.scrollWidth),
        h: Math.round(li.getBoundingClientRect().height),
        list: Math.round(document.querySelector('[data-task-tree]')!.getBoundingClientRect().width),
      }
    })

/** A project with the long title, a deadline on one row and a plan on another. */
async function mixedProject(page: Page, name: string): Promise<string> {
  const pid = await makeProject(page, name)
  await makeTask(page, pid, LONG_TITLE, { dueAt: dueAgo(2) })
  const mid = await makeTask(page, pid, '这一条什么日期都没有，标题也不算短')
  await makeTask(page, pid, '一条子任务，也没有日期', {}, mid)
  await makeTask(page, pid, '只有这一条有排期', { scheduledOn: dayOffset(3) })
  return pid
}

/**
 * §6, THE FIRST ONE, AND THE DEFECT ITSELF: 「你还是没有完全运用横向空间（字直接被截断了）」.
 * The user's own sentence, at 1440 WITH THE DETAIL COLUMN OPEN -- the ≈734px panel that is the
 * hardest case and the one the screenshot was taken in. The previous edition could only do it by
 * dropping the dates to a second line below a threshold; there is no threshold now, because the
 * dates are always on the second line and the title always owns the first.
 *
 * Asserted at both panel widths, from the same page, with the window never changing: the closed
 * panel is 1118px and the open one 734px, and a guard that only checks the easy one would have
 * passed before this stage as well.
 */
test('a real long title is not truncated at 1440, detail open or closed', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await registerFreshUser(page)
  const pid = await mixedProject(page, '长标题')
  await page.goto(`/projects/${pid}`)
  await expect(page.locator('[data-task-tree] li[data-depth]')).toHaveCount(4)
  // The slot really is reserved, or this measures a list with no furniture in it.
  await expect(page.locator('[data-task-tree] [data-lead-slot]')).toHaveCount(4)

  const closed = await firstRow(page)
  expect(closed.fits, `detail closed: title needs ${closed.needs}px of ${closed.cell}px`).toBe(true)
  expect(closed.needs, 'the title really is a long one').toBeGreaterThan(500)

  // Open the pane from ANOTHER row, so the row being measured is not the one that is selected.
  await page.locator('[data-task-tree] li[data-depth]').nth(1).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  const open = await firstRow(page)
  expect(await page.evaluate(() => window.innerWidth), 'the window did not change').toBe(1440)
  expect(open.list, `list with the detail open: ${open.list}px`).toBeLessThan(800)
  expect(open.fits, `detail open: title needs ${open.needs}px of ${open.cell}px`).toBe(true)
  // It got there by being given the width, not by the title being short or the list being wide.
  expect(open.cell, `title cell ${open.cell}px`).toBeGreaterThan(open.needs)
  expect(open.cell, `${closed.cell}px -> ${open.cell}px`).toBeLessThan(closed.cell)
})

/**
 * §6: 「带日期的行有第二行且文案完整到分钟；无日期无备注的行仍是一行」 -- both halves on ONE
 * list, since "a second line" passes trivially if every row has one and "one line" passes trivially
 * if none does.
 *
 * The minute is the assertion that matters: the mechanism this edition deleted compressed
 * 「10月4日 12:30 截止」 into 「已逾 2 天」 to fit an 8rem cell, and the user rejected exactly that.
 * The expected wording is derived from the instant the fixture was CREATED with, so the test says
 * the same thing at every hour of the day.
 */
test('a dated row has a second line, complete to the minute; a bare row stays one line', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await registerFreshUser(page)
  const pid = await makeProject(page, '两种行')
  // One instant, read once: deriving the expectation from a second `new Date()` would make this
  // test red for one minute in sixty.
  const due = new Date(Date.now() - 2 * DAY)
  const pad = (n: number) => String(n).padStart(2, '0')
  await makeTask(page, pid, '过期两天的', { dueAt: due.toISOString() })
  await makeTask(page, pid, '什么都没有的')
  await page.goto(`/projects/${pid}`)
  const row = (title: string) =>
    page.locator('[data-task-tree] li[data-depth]').filter({ hasText: title })
  await expect(page.locator('[data-task-tree] li[data-depth]')).toHaveCount(2)

  // The whole sentence, to the minute, with nothing dropped.
  await expect(row('过期两天的').locator('[data-row-meta]')).toHaveText(
    `${due.getMonth() + 1}月${due.getDate()}日 ${pad(due.getHours())}:${pad(due.getMinutes())} 截止·已逾 2 天`,
  )
  // The text is the carrier, not the colour and not the glyph (WCAG 1.4.1): the deadline's own
  // phrase and the lateness are both there in words.
  await expect(row('过期两天的').locator('[data-due-text]')).toContainText('截止')
  await expect(row('过期两天的').locator('[data-late-text]')).toHaveText('已逾 2 天')
  // ...and the icon has a name of its own, so a screen reader is not left with a hue.
  await expect(row('过期两天的').getByRole('img', { name: '截止已过' })).toHaveCount(1)

  // A row carrying information is 66px; a row carrying none is 44px and has no second line at all.
  //
  // BOTH NUMBERS ARE DERIVED FROM THE TYPE SCALE, not read off the browser and pasted back. The
  // cell is `py-2.5` (10px each side); the title is 行标题 16/24 and the second line is 元信息
  // 14/22 (typography spec §2, TDesign's px pairs). So 10 + 24 + 10 = 44 and 10 + 24 + 22 + 10 =
  // 66. The 44 is the SAME number the 15/20 title produced (12 + 20 + 8), which is why the
  // workbench's single-line row metric is untouched by a scale on which every step from the body
  // up got bigger -- the padding absorbed the four extra pixels of leading. Only the rows that
  // already pay for a second line got taller, and they got taller by exactly the 4px the meta
  // line's own leading grew (18 -> 22).
  const h = (title: string) =>
    row(title).evaluate((el) => Math.round(el.getBoundingClientRect().height))
  expect(await h('过期两天的'), 'a row with a second line').toBe(66)
  expect(await h('什么都没有的'), 'a row with nothing to say').toBe(44)
  await expect(row('什么都没有的').locator('[data-row-meta]')).toHaveCount(0)

  // AND THE TITLE SITS ON THE GLYPHS' OWN CENTRE LINE, on both kinds of row. The height alone
  // does not say this: the cell's padding has to be SYMMETRIC around a 24px title to put its
  // centre at 22, and `pt-3 pb-2` (the asymmetry the 15/20 title needed) adds up to the same 20px
  // and gives the same 44 and 66 while sitting the title two pixels low against a glyph column
  // that is still centred at 22 -- measured, which is why this assertion exists.
  const centres = (title: string) =>
    row(title).evaluate((el) => {
      const t = el.querySelector('[data-row-title]')!.getBoundingClientRect()
      const g = el.querySelector('[data-status-button]')!.getBoundingClientRect()
      const top = el.getBoundingClientRect().top
      return { title: t.top + t.height / 2 - top, glyph: g.top + g.height / 2 - top }
    })
  for (const title of ['过期两天的', '什么都没有的']) {
    const c = await centres(title)
    expect(Math.abs(c.title - c.glyph), `${title}: ${JSON.stringify(c)}`).toBeLessThanOrEqual(0.5)
  }
})

/**
 * §2: a task with BOTH a deadline and a plan wears the deadline at the row start -- the one that
 * bites -- and the second line lists both. Three channels, no colour among them: which glyph, and
 * two phrases of words.
 */
test('a row with both dates wears the deadline, and says both in words', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '两种日期都有', { dueAt: dueAgo(3), scheduledOn: dayOffset(2) })
  await page.goto(`/projects/${pid}`)
  const row = page.locator('[data-task-tree] li[data-depth]').first()

  // One glyph, and it is the deadline's.
  await expect(row.locator('[data-lead-icon]')).toHaveCount(1)
  await expect(row.locator('[data-lead-icon="missed"]')).toHaveCount(1)
  // Both dates on the second line, in full.
  await expect(row.locator('[data-due-text]')).toContainText('截止')
  await expect(row.locator('[data-late-text]')).toHaveText('已逾 3 天')
  await expect(row.locator('[data-plan-text]')).toContainText('排到')
})

/**
 * §2: the TREE's second line carries no breadcrumb (the project is known and the hierarchy is in
 * the indentation), while 今天's carries one -- and there the breadcrumb and the date share that
 * one line rather than taking two.
 */
test('the tree has no breadcrumb on its second line; 今天 shares one line with the date', async ({
  page,
}) => {
  // 1920, so the one-third 逾期 panel is wide enough to hold the crumb and the date side by side:
  // the claim is that they SHARE a line where there is room, not that the line never wraps -- §2
  // keeps the wording whole, so a cramped panel wraps it rather than cutting it.
  await page.setViewportSize({ width: 1920, height: 1000 })
  await registerFreshUser(page)
  const pid = await makeProject(page, '面包屑')
  const parent = await makeTask(page, pid, '父任务')
  await makeTask(page, pid, '子任务', { dueAt: dueAgo(2) }, parent)
  await page.goto(`/projects/${pid}`)
  const child = page.locator('[data-task-tree] li[data-depth="2"]')
  await expect(child.locator('[data-row-meta]')).toHaveCount(1)
  await expect(child.locator('[data-row-crumb]')).toHaveCount(0)
  await expect(child.locator('[data-row-meta]')).not.toContainText('面包屑')
  await expect(child.locator('[data-row-meta]')).not.toContainText('父任务')

  // The same task on 今天: one second line, carrying the project, the parent AND the date.
  await page.goto('/')
  const line = page.getByRole('region', { name: '逾期' }).locator('[data-row-meta]')
  await expect(line).toHaveCount(1)
  await expect(line.locator('[data-row-crumb]')).toHaveText('面包屑 › 父任务')
  // 逾期 is a summary (project and how late): the lateness is what shares the line with the crumb.
  await expect(line.locator('[data-late-text]')).toHaveText('已逾 2 天')
  // One line, not two: the crumb and the lateness share a baseline.
  const ys = await line.evaluate((el) => {
    const crumb = el.querySelector('[data-row-crumb]')!.getBoundingClientRect()
    const due = el.querySelector('[data-late-text]')!.getBoundingClientRect()
    return [Math.round(crumb.y), Math.round(due.y)]
  })
  expect(ys[0], `crumb y ${ys[0]}, date y ${ys[1]}`).toBe(ys[1])
})

// ------------------------------------------------------------- the mark on a row with something to read

// --------------------------------------------------------------------------- the action control

test('opening a row’s date control moves nothing on the row', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '逾期的', { dueAt: dueAgo(2) })
  await makeTask(page, pid, '下面那行', { dueAt: dueAgo(2) })
  await page.goto('/')

  const row = page
    .locator('li')
    .filter({ has: page.locator('[data-today-row]') })
    .first()
  const before = {
    row: (await row.boundingBox())!,
    title: (await page.locator('[data-today-row]').first().boundingBox())!,
    due: (await page.locator('[data-late-text]').first().boundingBox())!,
    next: (await page.locator('[data-today-row]').nth(1).boundingBox())!,
  }

  await triage(page, '逾期的').click()
  const panel = page.getByRole('group', { name: '处理逾期：逾期的' })
  await expect(panel).toBeVisible()

  const after = {
    row: (await row.boundingBox())!,
    title: (await page.locator('[data-today-row]').first().boundingBox())!,
    due: (await page.locator('[data-late-text]').first().boundingBox())!,
    next: (await page.locator('[data-today-row]').nth(1).boundingBox())!,
  }
  expect(after).toEqual(before)

  // The panel is over the page, not in the flow: it hangs below its own trigger and reaches down
  // across the row beneath, which is what "no reflow" means in practice.
  const box = (await panel.boundingBox())!
  const trig = (await triage(page, '逾期的').boundingBox())!
  expect(box.y).toBeGreaterThanOrEqual(trig.y + trig.height)
  expect(box.y + box.height).toBeGreaterThan(before.next.y)
})

test('the date control is reachable, operable and escapable by keyboard alone', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '键盘逾期', { dueAt: dueAgo(2) })
  await page.goto('/')

  // From the row itself, one Tab reaches the control: the row gained ONE tab stop, where the old
  // inline links added six.
  await page.locator('[data-today-row]').focus()
  await page.keyboard.press('Tab')
  await expect(triage(page, '键盘逾期')).toBeFocused()
  await expect(triage(page, '键盘逾期')).toHaveAttribute('aria-expanded', 'false')

  await page.keyboard.press('Enter')
  const panel = page.getByRole('group', { name: '处理逾期：键盘逾期' })
  await expect(panel).toBeVisible()
  await expect(triage(page, '键盘逾期')).toHaveAttribute('aria-expanded', 'true')

  // Escape closes it and focus comes back to the trigger, not to <body>.
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(triage(page, '键盘逾期')).toBeFocused()

  // And a triage action can be run entirely from the keyboard, sending the real request.
  await page.keyboard.press('Enter')
  await expect(panel).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(panel.getByRole('button', { name: '推迟到明天' })).toBeFocused()
  const res = patched(page)
  await page.keyboard.press('Enter')
  const body = (await res).request().postDataJSON() as { dueAt: string }
  expect(Object.keys(body)).toEqual(['dueAt'])
  expect(ymd(new Date(body.dueAt))).toBe(dayOffset(1))
  // The row left the page; focus went to the heading rather than falling to <body>.
  await expect(page.getByText('今天没有要做的事')).toBeVisible()
  await expect(page.locator('#today-heading')).toBeFocused()
})

test('转为排期下周 demotes the deadline to next Monday’s plan in one request', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '没人等下周', { dueAt: dueAgo(6) })
  await page.goto('/')
  await triage(page, '没人等下周').click()
  const res = patched(page)
  await page
    .getByRole('group', { name: '处理逾期：没人等下周' })
    .getByRole('button', { name: '下周', exact: true })
    .click()
  expect((await res).request().postDataJSON()).toEqual({
    dueAt: null,
    scheduledOn: nextMondayYmd(),
  })
  const tasks = (await (await page.request.get(`/api/v1/projects/${pid}/tasks`)).json()).tasks as {
    title: string
    dueAt: string | null
    scheduledOn: string | null
  }[]
  const t = tasks.find((x) => x.title === '没人等下周')!
  expect(t.dueAt).toBeNull()
  expect(t.scheduledOn).toBe(nextMondayYmd())
})

test('the open date control adds no horizontal scroll at 375', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '窄屏上的逾期任务标题也可能很长', { dueAt: dueAgo(2) })
  await page.goto('/')
  await triage(page, '窄屏上的逾期任务标题也可能很长').click()
  await expect(page.getByRole('group', { name: /^处理逾期：/ })).toBeVisible()
  // 375px zero horizontal scroll is a pinned result (plan section 7); a popover anchored to the
  // right edge of a row is exactly the kind of thing that quietly breaks it.
  const over = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }))
  expect(over).toEqual({ body: 0, doc: 0 })
})

// ------------------------------------------------------------------------------- the project rail

test('a cross-project row carries its own project’s rail, at one x, beside its name', async ({
  page,
}) => {
  await registerFreshUser(page)
  const a = await makeProject(page, '甲项目')
  const b = await makeProject(page, '乙项目')
  await makeTask(page, a, '甲一', { scheduledOn: dayOffset(0) })
  await makeTask(page, a, '甲二', { scheduledOn: dayOffset(0) })
  await makeTask(page, b, '乙一', { scheduledOn: dayOffset(0) })
  await page.goto('/')
  const section = page.getByRole('region', { name: '今天', exact: true })
  await expect(section.getByText('甲一')).toBeVisible()

  const railOf = (title: string) =>
    page
      .locator('li')
      .filter({ has: page.locator('[data-today-row]') })
      .filter({ hasText: title })
      .locator('[data-project-rail]')
  // The rail says which project, and says the SAME thing for two tasks of one project.
  await expect(railOf('甲一')).toHaveAttribute('data-project-rail', a)
  await expect(railOf('甲二')).toHaveAttribute('data-project-rail', a)
  await expect(railOf('乙一')).toHaveAttribute('data-project-rail', b)

  // Fixed x on every row OF ONE LIST -- a spine, not a decoration that follows the content.
  // Scoped to the 今天 queue since the workbench: the overdue panel and the completed-today panel
  // are lists of their own in another column, and a rail x shared across columns was never the
  // claim. Within the list the assertion is the same one, on the same three rows.
  const rails = await xs(page, '[aria-label="今天"] [data-project-rail]')
  expect(new Set(rails).size, `rail x values: ${rails.join(',')}`).toBe(1)
  // Six hues cannot identify an unbounded number of projects, so the rail is never alone: the
  // project's name is on the row as well (WCAG 1.4.1), and the rail itself is hidden from AT.
  await expect(section.getByText('甲项目').first()).toBeVisible()
  await expect(section.getByText('乙项目').first()).toBeVisible()
  await expect(railOf('甲一')).toHaveAttribute('aria-hidden', 'true')
  // Two different projects are allowed to share a hue; what must never happen is one project
  // wearing two. Same id, same class.
  const classOf = (title: string) => railOf(title).getAttribute('class')
  expect(await classOf('甲一')).toBe(await classOf('甲二'))
})

test('已完成 and the search results carry the same rail', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '归档测试')
  await makeTask(page, pid, '做完的事', { status: 'done' })
  await page.goto('/completed')
  await expect(page.getByText('做完的事')).toBeVisible()
  await expect(page.locator('[data-project-rail]').first()).toHaveAttribute(
    'data-project-rail',
    pid,
  )
  // The clock column lands at one x too.
  await makeTask(page, pid, '另一件做完的事', { status: 'done' })
  await page.reload()
  await expect(page.locator('time')).toHaveCount(2)
  const times = await xs(page, 'time')
  expect(new Set(times).size, `clock column x values: ${times.join(',')}`).toBe(1)

  await page.keyboard.press('f')
  await page.getByRole('combobox', { name: '搜索任务' }).fill('做完的事')
  await expect(page.locator('[data-search-result]')).toHaveCount(2)
  const resultRails = page.locator('[data-search-result] [data-project-rail]')
  await expect(resultRails).toHaveCount(2)
  await expect(resultRails.first()).toHaveAttribute('data-project-rail', pid)
})

// ---------------------------------------------------------------------------- the status marker

test('the status marker is the heaviest mark on the row, and still hue-free', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '在做', { status: 'in_progress' })
  await makeTask(page, pid, '待办的', { status: 'todo', scheduledOn: dayOffset(0) })
  await makeTask(page, pid, '整理中', { status: 'backlog', scheduledOn: dayOffset(0) })
  await page.goto('/')

  const mark = (name: string) => page.getByRole('img', { name })
  // 20px at 2px of stroke: the app's core semantic used to be the faintest thing on the row, and
  // the workbench stepped every size up again (spec section 4) around 46px rows.
  for (const name of ['进行中', '待办', '待整理'])
    expect(await mark(name).evaluate((el) => el.getBoundingClientRect().width)).toBe(20)

  // An OPEN task's mark is drawn in the body colour; a settled one stays muted. Value and weight,
  // never hue: `color` here must be the very same colour the row's own text is painted in, so no
  // status has a hue of its own and the shapes still carry the meaning.
  const colourOf = (l: ReturnType<typeof mark>) => l.evaluate((el) => getComputedStyle(el).color)
  const bodyColour = await page
    .locator('[data-today-row]')
    .first()
    .evaluate((el) => getComputedStyle(el).color)
  for (const name of ['进行中', '待办', '待整理'])
    expect(await colourOf(mark(name)), name).toBe(bodyColour)

  // A finished one recedes. (On 已完成, where every row is settled.)
  await makeTask(page, pid, '收工', { status: 'done' })
  await page.goto('/completed')
  await expect(page.getByText('收工')).toBeVisible()
  expect(await colourOf(mark('已完成'))).not.toBe(bodyColour)
  expect(await mark('已完成').evaluate((el) => el.getBoundingClientRect().width)).toBe(20)
})

// ------------------------------------------------------------- the two date semantics, by shape

test('a plan and a deadline differ by shape, not only by colour', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const late = new Date()
  late.setHours(23, 30, 0, 0)
  // Two rows, because a row that has both wears ONE glyph (the deadline's): comparing the two
  // silhouettes means putting them on two rows.
  await makeTask(page, pid, '有截止的', { dueAt: late.toISOString() })
  await makeTask(page, pid, '有计划的', { scheduledOn: dayOffset(2) })
  await page.goto(`/projects/${pid}`)
  const row = (title: string) =>
    page.locator('[data-task-tree] li[data-depth]').filter({ hasText: title })

  // The two leading glyphs differ, and they differ in ORIENTATION: the deadline's flag is taller
  // than it is wide, the plan's timeline is wider than it is tall. That is the channel that
  // survives a grey screenshot and a colourblind reader.
  const shape = (title: string) =>
    row(title)
      .locator('[data-lead-icon] svg')
      .evaluate((el) => {
        const ink = (el as SVGGraphicsElement).getBBox()
        return {
          paths: [...el.querySelectorAll('path')].map((p) => p.getAttribute('d')).join('|'),
          // The drawn ink, not the 12x12 canvas: this is the silhouette a grey screenshot shows.
          portrait: ink.height > ink.width,
        }
      })
  const due = await shape('有截止的')
  const plan = await shape('有计划的')
  expect(due.paths).not.toBe(plan.paths)
  expect(due.paths.length).toBeGreaterThan(0)
  expect(plan.paths.length).toBeGreaterThan(0)
  expect(due.portrait).toBe(true)
  expect(plan.portrait).toBe(false)

  // Each has a NAME of its own, and neither name is the other's substring: accessible names are one
  // flat namespace matched by substring, so a 「有截止，已逾期」 would make every query for the
  // standing flag match the missed one too.
  await expect(row('有截止的').getByRole('img', { name: '有截止' })).toHaveCount(1)
  await expect(row('有计划的').getByRole('img', { name: '有计划' })).toHaveCount(1)

  // And the words say it too, so nothing rests on the glyph either.
  await expect(row('有截止的').locator('[data-row-meta]')).toContainText('截止')
  await expect(row('有计划的').locator('[data-row-meta]')).toContainText('排到')
})

/**
 * §3 §6: the three mechanisms this edition replaced are GONE from the source, not merely unused.
 * Two layout systems side by side is the failure this guards: the columns would keep working, the
 * threshold would keep firing in some panel nobody measured, and the next stage would inherit both.
 *
 * Read off the source rather than the DOM on purpose -- a deleted mechanism leaves no trace in a
 * rendered page, which is exactly why "we deleted it" rots.
 */
test('the deleted mechanisms are absent from the source', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs')
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = `${dir}/${name}`
      return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx|css)$/.test(full) ? [full] : []
    })
  const files = walk('src')
  expect(files.length, 'source files scanned').toBeGreaterThan(30)
  // Comments are stripped first: the prose that RECORDS the deletion names the thing it deleted,
  // and a guard that cannot tell those apart would be answered by rewording a comment.
  const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ 	]*\/\/.*$/gm, '')

  const banned: [RegExp, string][] = [
    // 1. the 8rem deadline column and the 11rem plan column (and the tree's w-32 / w-44 twins).
    [/\b(8rem|11rem)\b/, 'a date column width'],
    [/\b(DUE_REM|PLAN_REM|dueColumnClass|planColumnClass|DueCell|PlanCell)\b/, 'a date column'],
    [/\bshrink-0 w-(32|44)\b/, "a tree date cell's fixed width"],
    // 2. the stack threshold and the container queries that drove it.
    [
      /ROW_DATE_STACK|rowDateStackClass|rowStackBelowRem|treeRowWrapClass|treeDateLineClass/,
      'the stack threshold',
    ],
    [/@container|@min-\[|@max-\[/, 'a container query'],
    // 3. the list measure derived from the column makeup.
    [
      /72\.75rem|75\.75rem|84\.5rem|53\.5rem|TITLE_BASELINE_REM|furnitureRem|listMeasureRem|listMeasureClass|columnCase|dateColumns/,
      'the derived list measure',
    ],
  ]
  const hits: string[] = []
  for (const file of files) {
    const text = code(readFileSync(file, 'utf8'))
    for (const [pattern, what] of banned) {
      const m = pattern.exec(text)
      if (m) hits.push(`${file}: ${what} -- ${JSON.stringify(m[0])}`)
    }
  }
  expect(hits, hits.join('\n')).toEqual([])

  // ...and the thing that REPLACED them is a single measure, named in ONE place. Four measures
  // keyed by column makeup is the mechanism §3 deleted; this is the test that notices it coming
  // back under another name. (Its own unit test names the literal too, which is its job.)
  const measures = files
    .filter((f) => !f.endsWith('.test.ts'))
    .filter((f) => /max-w-\[64rem\]/.test(code(readFileSync(f, 'utf8'))))
  expect(measures, "one file names the task lists' measure").toEqual(['src/rowLead.ts'])
})

// ------------------------------------------------------------------- the phone, deep in a tree

/**
 * Stage 2 named this and chose not to spend on it: at 375 a depth-3 tree row with a deadline cut
 * its title to "操…", because below `sm` the tree's date cells collapse to `w-auto` and the title
 * gets whatever is left after the indent, the handle, the chevron, the marker, the two dates and
 * the two row buttons.
 *
 * The claim being pinned is NOT "a title is never truncated" -- a long enough title at depth 3 on
 * a 375px screen has to end somewhere, and asserting a character count would be a number asserting
 * itself. The claim is that **the dates no longer take the title's width**: at the same depth, a
 * row with both dates gives its title exactly as much room as a row with none. That is the defect,
 * and the old layout failed it by about 170px.
 *
 * Stage 2's reason for leaving it was that a second line would cost every DATELESS row an empty
 * one. It does not: the wrapper is `hidden` when the row has no date. The height assertions below
 * are that half, which is the half stage 2 was actually worried about.
 */
test.describe('the tree on a phone', () => {
  test.use({ viewport: { width: 375, height: 820 } })

  test('a deep row’s dates no longer eat its title, and a bare row pays nothing', async ({
    page,
  }) => {
    await registerFreshUser(page)
    const pid = await makeProject(page, '深树')
    const a = await makeTask(page, pid, '顶层')
    const b = await makeTask(page, pid, '第二层', {}, a)
    // Same depth, same title length: the only difference is that one of them has both dates.
    await makeTask(
      page,
      pid,
      '第三层上的一条很长的任务标题',
      {
        dueAt: dueAgo(2),
        scheduledOn: dayOffset(1),
      },
      b,
    )
    await makeTask(page, pid, '第三层上的一条很长的别的标题', {}, b)

    await page.goto(`/projects/${pid}`)
    const dated = page.getByRole('button', { name: '任务：第三层上的一条很长的任务标题' })
    const bare = page.getByRole('button', { name: '任务：第三层上的一条很长的别的标题' })
    await dated.waitFor()

    const titleWidth = (handle: typeof dated) =>
      page
        .locator('li', { has: handle })
        .locator('span.truncate')
        .first()
        .evaluate((el) => Math.round(el.clientWidth))
    const withDates = await titleWidth(dated)
    const without = await titleWidth(bare)
    expect(withDates, 'the dates no longer take the title’s width').toBe(without)
    // ...and that width is most of the row, not a sliver. (Before, it was ~25 of ~195 CSS px.)
    expect(withDates).toBeGreaterThan(140)

    // The dates are still shown -- the title did not get its width by losing them.
    await expect(
      page.locator('li', { has: dated }).locator('[data-date-hint="overdue"]'),
    ).toBeVisible()
    await expect(
      page.locator('li', { has: dated }).locator('[data-date-hint="scheduled"]'),
    ).toBeVisible()

    // A row with dates is taller by one line; a row without them is not. No empty second line
    // was bought for every row in the tree. The magnitude is the workbench's single-line row
    // (44px, project.spec.ts pins it exactly at every depth), not the 32 the tree used to be: a
    // dateless row still costs ONE line, which is what this half is about.
    const datedBox = (await page.locator('li', { has: dated }).boundingBox())!
    const bareBox = (await page.locator('li', { has: bare }).boundingBox())!
    expect(datedBox.height).toBeGreaterThan(bareBox.height)
    expect(bareBox.height).toBeLessThanOrEqual(48)

    // ...and none of it bought a horizontal scrollbar.
    const overflow = await page.evaluate(() => ({
      body: document.body.scrollWidth - document.body.clientWidth,
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }))
    expect(overflow).toEqual({ body: 0, doc: 0 })
  })
})

// ------------------------------------------------------------------------- motion, on request

/**
 * The app has exactly one animation: the 120ms echo of the user's own status change. Section 7
 * says a reader who asks for no motion gets none, and nothing pinned that -- a stylesheet rule
 * is exactly the kind of thing a redesign deletes by accident.
 *
 * Both directions, because "0s under reduce" also holds for an app with no animation at all.
 */
test.describe('motion', () => {
  const duration = (page: Page) =>
    page
      .locator('[data-task-tree] svg circle[fill="currentColor"]')
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration)

  test.describe('asked for', () => {
    test.use({ reducedMotion: 'no-preference' })
    test('the status mark animates', async ({ page }) => {
      await registerFreshUser(page)
      const pid = await makeProject(page, 'P')
      await makeTask(page, pid, '会动的')
      await page.goto(`/projects/${pid}`)
      await page.getByRole('button', { name: '任务：会动的', exact: true }).waitFor()
      expect(await duration(page)).toBe('0.12s')
    })
  })

  test.describe('declined', () => {
    test.use({ reducedMotion: 'reduce' })
    test('the status mark does not', async ({ page }) => {
      await registerFreshUser(page)
      const pid = await makeProject(page, 'P')
      await makeTask(page, pid, '不动的')
      await page.goto(`/projects/${pid}`)
      await page.getByRole('button', { name: '任务：不动的', exact: true }).waitFor()
      expect(await duration(page)).toBe('0s')
    })
  })
})
