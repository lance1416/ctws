import { expect, test, type Page } from '@playwright/test'
import { makeProject, makeTask, registerFreshUser, sidewaysScroll } from './helpers'
import { dayOffset, dueAgo } from './days'

/**
 * THE ROW ANATOMY of the lists that are not the tree: a MARGIN that says when, a THREAD in the
 * project's colour, then the body -- marker, title, a second line that says where. The tree has
 * columns of its own (FR-054), measured here too.
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

/**
 * In the tree only the NAME is indented (FR-054): the stage, progress and due columns stay at one
 * x at every depth, so they read as columns down a deep tree, while the titles step in by one
 * indent per level.
 */
test('in the tree, depth indents the name and leaves the other columns alone', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await registerFreshUser(page)
  const pid = await makeProject(page, '深度')
  const a = await makeTask(page, pid, '第一层', { dueAt: dueAgo(2) })
  const b = await makeTask(page, pid, '第二层', { scheduledOn: dayOffset(3) }, a)
  await makeTask(page, pid, '第三层', { dueAt: dueAgo(9) }, b)
  await page.goto(`/projects/${pid}`)
  await expect(page.locator('[data-task-tree] li[data-depth]')).toHaveCount(3)

  for (const column of ['[data-row-stage]', '[data-row-progress]', '[data-row-due-cell]']) {
    const at = await xs(page, `[data-task-tree] ${column}`)
    expect(new Set(at).size, `${column} x values: ${at.join(',')}`).toBe(1)
  }
  const title = (depth: number) =>
    page
      .locator(`[data-task-tree] li[data-depth="${depth}"] [data-row-title]`)
      .evaluate((el) => Math.round(el.getBoundingClientRect().x))
  const [one, two, three] = [await title(1), await title(2), await title(3)]
  expect(two - one, 'one indent per level').toBe(22)
  expect(three - two, 'one indent per level').toBe(22)
})

/**
 * EVERY ROW IS ONE LINE, 36px (artboard 8), dated or not and at any depth: the date is in its own
 * column, not on a second line. And the title sits on the mark's own centre line, which the height
 * alone does not say.
 */
test('a dated row, a bare row and a nested row are all one line, 36px', async ({ page }) => {
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
  expect(await h('过期两天的')).toBe(36)
  expect(await h('什么都没有的')).toBe(36)
  expect(await h('深一层的')).toBe(36)
  // A leaf's mark is the row's 16, as on Today; a parent has its square there instead.
  expect(
    await row('深一层的')
      .getByRole('img', { name: 'To do' })
      .evaluate((el) => el.getBoundingClientRect().width),
  ).toBe(16)
  await expect(row('什么都没有的').locator('[data-progress-square]')).toHaveCount(1)

  const centres = (title: string) =>
    row(title).evaluate((el) => {
      const t = el.querySelector('[data-row-title]')!.getBoundingClientRect()
      const g = el.querySelector('[role="img"]')!.getBoundingClientRect()
      const top = el.getBoundingClientRect().top
      return { title: t.top + t.height / 2 - top, glyph: g.top + g.height / 2 - top }
    })
  for (const title of ['过期两天的', '什么都没有的', '深一层的']) {
    const c = await centres(title)
    expect(Math.abs(c.title - c.glyph), `${title}: ${JSON.stringify(c)}`).toBeLessThanOrEqual(0.5)
  }
})

/**
 * A task with BOTH a deadline and a plan shows the DEADLINE in the Due column -- the one that
 * bites -- flagged on red once missed. The plan is the detail's to say.
 */
test('a row with a plan and a deadline shows the deadline', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '两种日期都有', { dueAt: dueAgo(3), scheduledOn: dayOffset(2) })
  await page.goto(`/projects/${pid}`)
  const due = page.locator('[data-task-tree] li[data-depth]').first().locator('[data-row-due]')
  await expect(due).toHaveAttribute('data-row-due', 'late')
  await expect(due.locator('svg')).toHaveCount(1)
  // Said, not only coloured: a screen reader hears what kind of date this is.
  await expect(due).toContainText('Due')
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
 * way, and the other columns never take more than their own width.
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
  // The other columns are really there, or this measures a list with no furniture in it.
  await expect(page.locator('[data-task-tree] [data-row-due]')).toHaveCount(1)

  const closed = await firstRow(page)
  expect(closed.needs, 'the title really is a long one').toBeGreaterThan(500)
  // With the detail closed, Linked sits beside the tree: the title keeps the larger share.
  expect(
    closed.cell / closed.list,
    `title cell ${closed.cell}px of ${closed.list}px`,
  ).toBeGreaterThan(0.45)

  // Open the pane from ANOTHER row, so the row being measured is not the one that is selected.
  await page.locator('[data-task-tree] li[data-depth]').nth(1).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  const open = await firstRow(page)
  expect(await page.evaluate(() => window.innerWidth), 'the window did not change').toBe(1440)
  expect(open.list, `list with the detail open: ${open.list}px`).toBeLessThan(800)
  // Every pixel the list changed by came out of (or went to) the title: the stage, progress and
  // due columns do not grow or shrink with it. (Opening the detail moves Linked under the tree, so
  // the list is about as wide either way.)
  expect(closed.cell - open.cell, 'the title moves with the list').toBe(closed.list - open.list)
  // The stage, progress and due columns and the row's own controls (I-06) are a fixed 412px with
  // their gaps: the title has all the rest, the larger share with the inspector closed, and still
  // more than a third beside the 400px inspector.
  expect(open.cell / open.list, `title cell ${open.cell}px of ${open.list}px`).toBeGreaterThan(0.35)
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

test('a finished task’s search result wears its project', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '归档测试')
  await makeTask(page, pid, '做完的事', { status: 'done' })
  await makeTask(page, pid, '另一件做完的事', { status: 'done' })
  await page.goto('/today')
  await page.locator('#today-heading').waitFor()

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

  // Artboard 1: what is being worked on is green, what waits to be started muted, the backlog
  // subtle. The shapes carry the meaning: the colour is said twice, never alone.
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
  const subtle = await token('subtle')
  expect(await colourOf(mark('To do'))).toBe(await token('muted'))
  expect(await colourOf(mark('Backlog'))).toBe(subtle)
  expect(await colourOf(mark('In progress'))).toBe(await token('go'))
})

// ------------------------------------------------------------- the two date semantics, by shape

test('the Due column says how near: amber this week, red once missed, grey further off', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '明天截止的', {
    dueAt: new Date(`${dayOffset(1)}T12:00:00`).toISOString(),
  })
  await makeTask(page, pid, '过了的', { dueAt: dueAgo(2) })
  await makeTask(page, pid, '还远的', {
    dueAt: new Date(`${dayOffset(20)}T12:00:00`).toISOString(),
  })
  await makeTask(page, pid, '只有计划的', { scheduledOn: dayOffset(2) })
  await page.goto(`/projects/${pid}`)
  const due = (title: string) =>
    page
      .locator('[data-task-tree] li[data-depth]')
      .filter({ hasText: title })
      .locator('[data-row-due]')

  await expect(due('明天截止的')).toHaveAttribute('data-row-due', 'soon')
  await expect(due('明天截止的')).toContainText('Tomorrow')
  await expect(due('过了的')).toHaveAttribute('data-row-due', 'late')
  await expect(due('还远的')).toHaveAttribute('data-row-due', 'quiet')
  // The flag is the channel that survives a grey screenshot and a colourblind reader: a near or
  // missed deadline carries one, a distant one is words alone.
  await expect(due('明天截止的').locator('svg')).toHaveCount(1)
  await expect(due('过了的').locator('svg')).toHaveCount(1)
  await expect(due('还远的').locator('svg')).toHaveCount(0)
  // ...and the near and the missed are two colour families.
  const colour = (title: string) => due(title).evaluate((el) => getComputedStyle(el).color)
  expect(await colour('明天截止的')).not.toBe(await colour('过了的'))
  // A plan is not a deadline: the column says nothing for it.
  await expect(due('只有计划的')).toHaveCount(0)
})

// ------------------------------------------------------------------- the phone, deep in a tree

/**
 * THE DUE COLUMN MUST NOT TAKE THE TITLE'S WIDTH. At 375 the tree is the name and the due day; a
 * deep row has what is left after the indent, the fold and the mark. The claim is that at the same
 * depth a dated row's title is exactly as wide as a bare one's -- the date costs the title nothing
 * -- and that this width is most of the row, not a sliver.
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
    // A phone's tree (FR-088): a row a task, its tags on a second line.
    const row = (title: string) => page.locator('[data-phone-tree-row]').filter({ hasText: title })
    await expect(row('第三层上的一条很长的任务标题')).toBeVisible()
    const titleWidth = (title: string) =>
      row(title)
        .locator('[data-row-title]')
        .evaluate((el) => Math.round(el.clientWidth))
    const dated = await titleWidth('第三层上的一条很长的任务标题')
    expect(dated, 'the due column takes nothing from the title').toBe(
      await titleWidth('第三层上的一条很长的别的标题'),
    )
    // Three levels in, past the indent and the mark; the date is on the line under it.
    expect(dated).toBeGreaterThan(100)
    // The date is still shown: the title did not get its width by losing it.
    await expect(row('第三层上的一条很长的任务标题').locator('[data-row-due]')).toBeVisible()
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
      .locator('[data-task-tree] svg [data-part="check"]')
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
