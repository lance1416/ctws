import { expect, test, type Page } from '@playwright/test'
import { registerFreshUser } from './helpers'

/**
 * The row system (redesign stage 2): one structure for every list -- the project rail at x=0, the
 * status marker, the title, then the deadline and plan columns and the action slot.
 *
 * What these guards are for, in order of how easy it would be to fake:
 * - "the dates are in a column" is NOT provable by asserting a date is present. It is provable
 *   only by measuring the same cell on rows whose titles and labels differ in length and finding
 *   it at the same x. Before this redesign every one of those x values was different.
 * - "the action control does not shift the row" is provable only by measuring the row before and
 *   after it opens.
 * - "the triage still does what it did" is provable only from the request body; the UI can agree
 *   with itself while sending nothing.
 */

const HEADERS = { 'x-ctws-client': 'web' }
const DAY = 86_400_000

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dayOffset = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return ymd(d)
}
const dueAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString()
const nextMondayYmd = () => {
  const d = new Date()
  d.setDate(d.getDate() + (d.getDay() === 0 ? 1 : 8 - d.getDay()))
  return ymd(d)
}

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

// ----------------------------------------------------------------------- the columns are columns

test('on 今天, every row puts its deadline and its plan at the same x', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  // Titles of wildly different lengths, and date labels of different lengths too ("已逾 2 天"
  // against "已逾 11 天"). Before the row system, each of these landed at its own x.
  await makeTask(page, pid, '短', { dueAt: dueAgo(2), scheduledOn: dayOffset(3) })
  await makeTask(page, pid, '中等长度的一个标题', { dueAt: dueAgo(11), scheduledOn: dayOffset(1) })
  await makeTask(page, pid, '一个非常非常非常非常非常长的标题用来把右边挤掉', {
    dueAt: dueAgo(4),
    scheduledOn: dayOffset(9),
  })
  await page.goto('/')
  const section = page.getByRole('region', { name: '逾期' })
  await expect(section.locator('[data-date-hint="overdue"]')).toHaveCount(3)

  const due = await xs(page, '[data-date-hint="overdue"]')
  expect(new Set(due).size, `deadline column x values: ${due.join(',')}`).toBe(1)
  const plan = await xs(page, '[data-date-hint="scheduled"]')
  expect(new Set(plan).size, `plan column x values: ${plan.join(',')}`).toBe(1)
  // Two columns, in order, not one zone the two share.
  expect(plan[0]!).toBeGreaterThan(due[0]!)

  // And the title cell -- the thing whose length used to decide where the dates went -- starts at
  // the same x as well, so the eye lands in the same place on every line.
  const titles = await xs(page, '[data-today-row]')
  expect(new Set(titles).size, `title column x values: ${titles.join(',')}`).toBe(1)
})

test('in the project tree, depth moves the title but never the date columns', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const a = await makeTask(page, pid, '根', { dueAt: dueAgo(3) })
  const b = await makeTask(page, pid, '子', { dueAt: dueAgo(14) }, a)
  await makeTask(page, pid, '孙孙孙孙孙孙孙孙孙', { dueAt: dueAgo(1) }, b)
  await page.goto(`/projects/${pid}`)
  await expect(page.locator('li[data-depth]')).toHaveCount(3)
  // The depths really do differ, or the alignment claim is about one indentation level.
  expect(
    await page
      .locator('li[data-depth]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-depth'))),
  ).toEqual(['1', '2', '3'])

  const due = await xs(page, '[data-date-hint="overdue"]')
  expect(new Set(due).size, `deadline column x values: ${due.join(',')}`).toBe(1)
  // Indentation is still visible: the titles are NOT in one column here, by design (depth is the
  // tree's own business), which is exactly why the date columns have to be.
  const marks = await xs(page, '[data-status-button]')
  expect(new Set(marks).size).toBe(3)
})

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
    due: (await page.locator('[data-date-hint="overdue"]').first().boundingBox())!,
    next: (await page.locator('[data-today-row]').nth(1).boundingBox())!,
  }

  await triage(page, '逾期的').click()
  const panel = page.getByRole('group', { name: '处理逾期：逾期的' })
  await expect(panel).toBeVisible()

  const after = {
    row: (await row.boundingBox())!,
    title: (await page.locator('[data-today-row]').first().boundingBox())!,
    due: (await page.locator('[data-date-hint="overdue"]').first().boundingBox())!,
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
  const section = page.getByRole('region', { name: '今天' })
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

  // Fixed x on every row -- a spine, not a decoration that follows the content.
  const rails = await xs(page, '[data-project-rail]')
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
  await page.getByRole('textbox', { name: '搜索任务' }).fill('做完的事')
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
  // 18px, not the 16px it used to be: the app's core semantic was the faintest thing on the row.
  for (const name of ['进行中', '待办', '待整理'])
    expect(await mark(name).evaluate((el) => el.getBoundingClientRect().width)).toBe(18)

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
  expect(await mark('已完成').evaluate((el) => el.getBoundingClientRect().width)).toBe(18)
})

// ------------------------------------------------------------- the two date semantics, by shape

test('a plan and a deadline differ by shape, not only by colour', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const late = new Date()
  late.setHours(23, 30, 0, 0)
  await makeTask(page, pid, '两种日期', {
    dueAt: late.toISOString(),
    scheduledOn: dayOffset(-2),
  })
  await page.goto('/')
  const row = page
    .locator('li')
    .filter({ has: page.locator('[data-today-row]') })
    .first()

  // Each cell carries a glyph of its own, so the distinction survives a grey screenshot and a
  // colourblind reader. The paths differ, and they differ in ORIENTATION: the deadline's flag is
  // taller than it is wide, the plan's timeline is wider than it is tall.
  const shape = (hint: string) =>
    row.locator(`[data-date-hint="${hint}"] svg`).evaluate((el) => {
      const ink = (el as SVGGraphicsElement).getBBox()
      return {
        paths: [...el.querySelectorAll('path')].map((p) => p.getAttribute('d')).join('|'),
        // The drawn ink, not the 12x12 canvas: this is the silhouette a grey screenshot shows.
        portrait: ink.height > ink.width,
      }
    })
  const due = await shape('due')
  const carried = await shape('carried')
  expect(due.paths).not.toBe(carried.paths)
  expect(due.paths.length).toBeGreaterThan(0)
  expect(carried.paths.length).toBeGreaterThan(0)
  // A deadline is UPRIGHT (a flag on a pole); a plan is WIDE (a tick on a timeline). Orientation
  // is the channel that survives both greyscale and colourblindness.
  expect(due.portrait).toBe(true)
  expect(carried.portrait).toBe(false)

  // And the words say it too, so nothing rests on the glyph either.
  await expect(row.locator('[data-date-hint="due"]')).toContainText('截止')
  await expect(row.locator('[data-date-hint="carried"]')).toContainText('原定')
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
    // was bought for every row in the tree.
    const datedBox = (await page.locator('li', { has: dated }).boundingBox())!
    const bareBox = (await page.locator('li', { has: bare }).boundingBox())!
    expect(datedBox.height).toBeGreaterThan(bareBox.height)
    expect(bareBox.height).toBeLessThanOrEqual(40)

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
