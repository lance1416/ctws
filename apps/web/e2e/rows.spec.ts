import { expect, test, type Page } from '@playwright/test'
import { makeProject, makeTask, registerFreshUser, sidewaysScroll } from './helpers'
import { dayOffset, dueAgo } from './days'

/**
 * THE ROW ANATOMY: a MARGIN that says when, a THREAD in the project's colour, then the body --
 * marker, title, a second line that says where, and a short note on the right.
 *
 *   [margin 4.5rem][thread 3px][marker][title ............................][note]
 *                                       [where it came from]
 *
 * What these guards are for, in order of how easy it would be to fake:
 * - "the margin is a column" is NOT provable by asserting a date is present. It is provable only by
 *   measuring where the words END on rows whose words differ, and finding one x.
 * - "the title is not truncated" is provable only by measuring `scrollWidth` against `clientWidth`
 *   on a REAL long title at the narrowest panel width.
 * - "the thread joins the rows" is provable only from its box: one x, the row's height, no radius.
 */

/** Every x of a set of cells, rounded-key to the pixel: sub-pixel layout noise is not a column break. */
async function xs(page: Page, selector: string): Promise<number[]> {
  const boxes = await page
    .locator(selector)
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().x)))
  expect(boxes.length, `cells matching ${selector}`).toBeGreaterThan(1)
  return boxes
}

// ------------------------------------------------------------------ the margin and the thread

/** Where each of a set of elements ENDS, rounded-key to the pixel. */
async function rights(page: Page, selector: string): Promise<number[]> {
  const ends = await page
    .locator(selector)
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().right)))
  expect(ends.length, `cells matching ${selector}`).toBeGreaterThan(1)
  return ends
}

/**
 * In the tree the BODY is indented and nothing else is: the margin's words and the thread stay at
 * one x at every depth, so the dates still read as one column down a deep tree, while the titles
 * step in by one indent per level.
 */
test('in the tree, depth indents the body and leaves the margin and the thread alone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await registerFreshUser(page)
  const pid = await makeProject(page, '深度')
  const a = await makeTask(page, pid, '第一层', { dueAt: dueAgo(2) })
  const b = await makeTask(page, pid, '第二层', { scheduledOn: dayOffset(3) }, a)
  await makeTask(page, pid, '第三层', { dueAt: dueAgo(9) }, b)
  await page.goto(`/projects/${pid}`)
  await expect(page.locator('[data-task-tree] li[data-depth]')).toHaveCount(3)

  const ends = await rights(page, '[data-task-tree] [data-row-lead-text]')
  expect(new Set(ends).size, `margin ends: ${ends.join(',')}`).toBe(1)
  const threads = await xs(page, '[data-task-tree] [data-project-rail]')
  expect(new Set(threads).size, `thread x values: ${threads.join(',')}`).toBe(1)
  const title = (depth: number) =>
    page
      .locator(`[data-task-tree] li[data-depth="${depth}"] [data-row-title]`)
      .evaluate((el) => Math.round(el.getBoundingClientRect().x))
  const [one, two, three] = [await title(1), await title(2), await title(3)]
  expect(two - one, 'one indent per level').toBe(20)
  expect(three - two, 'one indent per level').toBe(20)
})

/**
 * A ROW WITH NOTHING UNDER ITS TITLE IS ONE LINE, 44px, dated or not and at any depth: the date is
 * in the margin, not on a second line. 10 + 24 + 10, from the type scale's 16/24 title. And the
 * title sits on the marker's own centre line, which the height alone does not say.
 */
test('a dated row, a bare row and a nested row are all one line, 44px', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await registerFreshUser(page)
  const pid = await makeProject(page, '两种行')
  await makeTask(page, pid, '过期两天的', { dueAt: dueAgo(2) })
  const bare = await makeTask(page, pid, '什么都没有的')
  await makeTask(page, pid, '深一层的', {}, bare)
  await page.goto(`/projects/${pid}`)
  const row = (title: string) =>
    page.locator('[data-task-tree] li[data-depth]').filter({ hasText: title })
  await expect(page.locator('[data-task-tree] li[data-depth]')).toHaveCount(3)
  const h = (title: string) =>
    row(title).evaluate((el) => Math.round(el.getBoundingClientRect().height))
  expect(await h('过期两天的')).toBe(44)
  expect(await h('什么都没有的')).toBe(44)
  expect(await h('深一层的')).toBe(44)
  await expect(row('过期两天的').locator('[data-row-meta]')).toHaveCount(0)
  // The marker inside it is 20px, not a 16px glyph left sitting in a taller row.
  expect(
    await row('深一层的')
      .getByRole('img', { name: 'To do' })
      .evaluate((el) => el.getBoundingClientRect().width),
  ).toBe(20)

  const centres = (title: string) =>
    row(title).evaluate((el) => {
      const t = el.querySelector('[data-row-title]')!.getBoundingClientRect()
      const g = el.querySelector('[data-status-button]')!.getBoundingClientRect()
      const lead = el.querySelector('[data-row-lead-text]')?.getBoundingClientRect()
      const top = el.getBoundingClientRect().top
      return {
        title: t.top + t.height / 2 - top,
        glyph: g.top + g.height / 2 - top,
        lead: lead ? lead.top + lead.height / 2 - top : null,
      }
    })
  for (const title of ['过期两天的', '什么都没有的']) {
    const c = await centres(title)
    expect(Math.abs(c.title - c.glyph), `${title}: ${JSON.stringify(c)}`).toBeLessThanOrEqual(0.5)
    // The margin's word sits on the title's line, not above or below it.
    if (c.lead !== null)
      expect(Math.abs(c.lead - c.title), JSON.stringify(c)).toBeLessThanOrEqual(1)
  }
})

/**
 * A task with BOTH a deadline and a plan shows the DEADLINE in its margin -- the one that bites --
 * flagged, with the moment in full as the margin's title.
 */
test('a row with a plan and a deadline shows the deadline', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '两种日期都有', { dueAt: dueAgo(3), scheduledOn: dayOffset(2) })
  await page.goto(`/projects/${pid}`)
  const lead = page.locator('[data-task-tree] li[data-depth]').first().locator('[data-row-lead]')
  await expect(lead).toHaveAttribute('data-row-lead', 'missed')
  await expect(lead.locator('[data-flag]')).toHaveCount(1)
  await expect(lead).toHaveAttribute('title', /^Due /)
  // Said, not only coloured: a screen reader hears what kind of date this is.
  await expect(lead).toContainText('Overdue')
})

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
 * A REAL LONG TITLE KEEPS THE LINE, at 1440, with the detail closed (Linked beside the tree) and
 * open (the detail the third column, Linked under the tree): the title has most of the row either
 * way, and the margin, the thread and the note never take more than their own width.
 *
 * Asserted at both panel widths, from the same page, with the window never changing: the closed
 * panel is 1118px and the open one 734px, and a guard that only checked the easy one would pass
 * on a layout that fails the narrow one.
 */
test('a real long title is not truncated at 1440, detail open or closed', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await registerFreshUser(page)
  const pid = await mixedProject(page, '长标题')
  await page.goto(`/projects/${pid}`)
  await expect(page.locator('[data-task-tree] li[data-depth]')).toHaveCount(4)
  // The margin is really there, or this measures a list with no furniture in it.
  await expect(page.locator('[data-task-tree] [data-row-lead-text]')).toHaveCount(2)

  const closed = await firstRow(page)
  expect(closed.needs, 'the title really is a long one').toBeGreaterThan(500)
  // With the detail closed, Linked sits beside the tree: the title keeps most of the row.
  expect(
    closed.cell / closed.list,
    `title cell ${closed.cell}px of ${closed.list}px`,
  ).toBeGreaterThan(0.6)

  // Open the pane from ANOTHER row, so the row being measured is not the one that is selected.
  await page.locator('[data-task-tree] li[data-depth]').nth(1).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  const open = await firstRow(page)
  expect(await page.evaluate(() => window.innerWidth), 'the window did not change').toBe(1440)
  expect(open.list, `list with the detail open: ${open.list}px`).toBeLessThan(800)
  // Every pixel the list changed by came out of (or went to) the title: the margin, the thread and
  // the note do not grow or shrink with it. (Opening the detail moves Linked under the tree, so
  // the list is about as wide either way.)
  expect(closed.cell - open.cell, 'the title moves with the list').toBe(closed.list - open.list)
  expect(open.cell / open.list, `title cell ${open.cell}px of ${open.list}px`).toBeGreaterThan(0.6)
})

/**
 * The TREE's second line carries no breadcrumb (the project is known and the hierarchy is in the
 * indentation), while Today's carries one.
 */
test('the tree has no breadcrumb; Today says where in its path column', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '面包屑')
  const parent = await makeTask(page, pid, '父任务')
  await makeTask(page, pid, '子任务', { dueAt: dueAgo(2) }, parent)
  await page.goto(`/projects/${pid}`)
  const child = page.locator('[data-task-tree] li[data-depth="2"]')
  await expect(child.locator('[data-row-crumb]')).toHaveCount(0)
  await expect(child).not.toContainText('面包屑')

  // Today says where, in its own column: the project's square and the task it is under.
  await page.goto('/today')
  const path = page.getByRole('region', { name: 'Overdue' }).locator('[data-row-path]')
  await expect(path).toHaveText(/父任务$/)
})

// ------------------------------------------------------------- the mark on a row with something to read

// --------------------------------------------------------------------------- the action control

// ------------------------------------------------------------------------------- the project rail

test('Done carries the rail, and a search result its project', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '归档测试')
  await makeTask(page, pid, '做完的事', { status: 'done' })
  await page.goto('/review?view=done')
  await expect(page.getByText('做完的事')).toBeVisible()
  await expect(page.locator('[data-project-rail]').first()).toHaveAttribute(
    'data-project-rail',
    pid,
  )
  // The clock is the margin, and it ends at one x too.
  await makeTask(page, pid, '另一件做完的事', { status: 'done' })
  await page.reload()
  await expect(page.locator('time')).toHaveCount(2)
  const times = await rights(page, 'time')
  expect(new Set(times).size, `clock ends: ${times.join(',')}`).toBe(1)

  await page.keyboard.press('Control+k')
  await page.getByRole('combobox', { name: 'Search' }).fill('做完的事')
  await expect(page.locator('[data-search-result]')).toHaveCount(2)
  // A result wears its project's square beside where it sits (artboard 9), not a rail.
  const squares = page.locator('[data-search-result] [data-project-square]')
  await expect(squares).toHaveCount(2)
  await expect(squares.first()).toHaveAttribute('data-project-square', pid)
})

// ---------------------------------------------------------------------------- the status marker

test('the status marker is the row’s heaviest mark, and only in progress has a hue', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '在做', { status: 'in_progress' })
  await makeTask(page, pid, '待办的', { status: 'todo', scheduledOn: dayOffset(0) })
  await makeTask(page, pid, '整理中', { status: 'backlog', scheduledOn: dayOffset(0) })
  await page.goto('/today')

  const mark = (name: string) => page.getByRole('img', { name })
  // 16 in Today's first column, which is 16 wide (DES-001 section 4); 20 elsewhere, below.
  for (const name of ['In progress', 'To do', 'Backlog'])
    expect(await mark(name).evaluate((el) => el.getBoundingClientRect().width)).toBe(16)

  // What is being worked on is green, as its block's badge is; every other mark is muted
  // (artboards 1, 12). The shapes carry the meaning: the colour is said twice, never alone.
  const colourOf = (l: ReturnType<typeof mark>) => l.evaluate((el) => getComputedStyle(el).color)
  const token = (name: string) =>
    page.evaluate((n) => {
      const probe = document.createElement('span')
      probe.style.color = `var(--color-${n})`
      document.body.append(probe)
      const colour = getComputedStyle(probe).color
      probe.remove()
      return colour
    }, name)
  const muted = await token('muted')
  for (const name of ['To do', 'Backlog']) expect(await colourOf(mark(name)), name).toBe(muted)
  expect(await colourOf(mark('In progress'))).toBe(await token('go'))

  // A finished one is muted too, and told by its filled shape. (On Done, where every row is.)
  await makeTask(page, pid, '收工', { status: 'done' })
  await page.goto('/review?view=done')
  await expect(page.getByText('收工')).toBeVisible()
  expect(await colourOf(mark('Done'))).toBe(muted)
  expect(await mark('Done').evaluate((el) => el.getBoundingClientRect().width)).toBe(20)
})

// ------------------------------------------------------------- the two date semantics, by shape

test('a deadline is flagged and a plan is not: they differ by shape as well as colour', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const late = new Date()
  late.setHours(23, 30, 0, 0)
  await makeTask(page, pid, '有截止的', { dueAt: late.toISOString() })
  await makeTask(page, pid, '有计划的', { scheduledOn: dayOffset(2) })
  await page.goto(`/projects/${pid}`)
  const lead = (title: string) =>
    page
      .locator('[data-task-tree] li[data-depth]')
      .filter({ hasText: title })
      .locator('[data-row-lead]')

  // The flag is the channel that survives a grey screenshot and a colourblind reader: a deadline
  // carries one, a plan never does.
  await expect(lead('有截止的').locator('[data-flag]')).toHaveCount(1)
  await expect(lead('有计划的').locator('[data-flag]')).toHaveCount(0)
  // ...the colours are two families...
  const colour = (title: string) => lead(title).evaluate((el) => getComputedStyle(el).color)
  expect(await colour('有截止的')).not.toBe(await colour('有计划的'))
  // ...and the words say which is which, for a screen reader.
  await expect(lead('有截止的')).toContainText('Due')
  await expect(lead('有计划的')).toContainText('Planned')
})

// ------------------------------------------------------------------- the phone, deep in a tree

/**
 * THE MARGIN MUST NOT TAKE THE TITLE'S WIDTH. At 375 a deep tree row has what is left after the
 * margin, the thread, the indent, the handle, the chevron and the marker. The claim is that at the
 * same depth a dated row's title is exactly as wide as a bare one's -- the date costs the title
 * nothing -- and that this width is most of the row, not a sliver.
 */
test.describe('the tree on a phone', () => {
  test.use({ viewport: { width: 375, height: 820 } })

  test('a deep row keeps its title, dated or not, and nothing scrolls sideways', async ({
    page,
  }) => {
    await registerFreshUser(page)
    const pid = await makeProject(page, '深树')
    const a = await makeTask(page, pid, '顶层')
    const b = await makeTask(page, pid, '第二层', {}, a)
    await makeTask(
      page,
      pid,
      '第三层上的一条很长的任务标题',
      { dueAt: dueAgo(2), scheduledOn: dayOffset(1) },
      b,
    )
    await makeTask(page, pid, '第三层上的一条很长的别的标题', {}, b)

    await page.goto(`/projects/${pid}`)
    const row = (title: string) =>
      page.locator('[data-task-tree] li[data-depth]').filter({ hasText: title })
    await expect(row('第三层上的一条很长的任务标题')).toBeVisible()
    const titleWidth = (title: string) =>
      row(title)
        .locator('[data-row-title]')
        .evaluate((el) => Math.round(el.clientWidth))
    const dated = await titleWidth('第三层上的一条很长的任务标题')
    expect(dated, 'the margin takes nothing from the title').toBe(
      await titleWidth('第三层上的一条很长的别的标题'),
    )
    expect(dated).toBeGreaterThan(140)
    // The date is still shown: the title did not get its width by losing it.
    await expect(row('第三层上的一条很长的任务标题').locator('[data-row-lead-text]')).toBeVisible()
    expect(await sidewaysScroll(page)).toEqual({ doc: 0, body: 0 })
  })
})

// ------------------------------------------------------------------------- motion, on request

/**
 * The app has exactly one animation: the 120ms echo of a status change the reader made. A reader
 * who asks for no motion gets none.
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
      await page.getByRole('button', { name: 'Task: 会动的', exact: true }).waitFor()
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
      await page.getByRole('button', { name: 'Task: 不动的', exact: true }).waitFor()
      expect(await duration(page)).toBe('0s')
    })
  })
})
