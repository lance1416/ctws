import { expect, test, type Page } from '@playwright/test'
import {
  backdateProjectActivity,
  makeProject,
  makeTask,
  movementOf,
  openDetail,
  registerFreshUser,
} from './helpers'

/** The month names the app prints, so a spec can build the string the page will show. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * THE PROJECT PAGE as a workbench (workbench spec §2): the header banner carrying this line of
 * work's state, the tree in a panel, and the detail as the third column rather than a layer.
 *
 * What these guards are for, in order of how easy each would be to fake:
 * - "the four numbers are right" is not provable by reading numbers off the screen and comparing
 *   them to numbers the test also computed. They are compared against the SERVER's own answer,
 *   per project, so a banner that counted client-side would have to agree with the query that
 *   produced it. Two projects with different numbers, visited one after the other, because a
 *   banner showing workspace-wide totals passes any one-project assertion.
 * - "no percentage" cannot be left to the counts test: a bar sitting beside four correct counts
 *   passes every assertion about the counts, so it gets its own, and that one has to catch a bar
 *   drawn as a plain div rather than only a <progress>.
 * - "the detail is a column, not a layer" is only provable from BOTH ends of the width rule, and
 *   the focus trap has to be asserted present at one end and absent at the other -- a pane that
 *   always traps passes an overlay-only test, and one that never traps passes a pane-only test.
 * - "the rail is one spine" is a claim about drawn ink: a column of per-row dashes and an unbroken
 *   bar both have one rail per row at one x. Only the gaps between them tell the two apart.
 */
const DAY = 86_400_000
const WIDE = { width: 1440, height: 1000 }
// 1024: the widest viewport still BELOW the 1280 threshold, so it is the case a min-width rule
// gets wrong most easily.
const MEDIUM = { width: 1024, height: 800 }
const dueAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString()
const header = (page: Page) =>
  page.getByRole('region', { name: 'Project at a glance', exact: true })
const stat = (page: Page, label: string) => header(page).locator(`[data-stat="${label}"] dd`)

// ------------------------------------------------------------------ the four numbers in the banner

test('the project header shows the four numbers the server reports, for THIS project', async ({
  page,
}) => {
  await registerFreshUser(page)
  await page.setViewportSize(WIDE)
  const busy = await makeProject(page, '很忙的线')
  const calm = await makeProject(page, '很闲的线')

  // 很忙的线: four open, two of them overdue, two finished this week.
  await makeTask(page, busy, '忙一', { dueAt: dueAgo(3) })
  await makeTask(page, busy, '忙二', { dueAt: dueAgo(1) })
  await makeTask(page, busy, '忙三')
  await makeTask(page, busy, '忙四')
  for (const t of ['忙五', '忙六']) await makeTask(page, busy, t, { status: 'done' })
  // 很闲的线: one open, none late, none finished. Different in every one of the four numbers, so
  // a banner showing workspace-wide totals (or the other project's) fails on this page.
  await makeTask(page, calm, '闲一')

  const server = await movementOf(page)
  const expected = (id: string) => server.find((r) => r.projectId === id)!
  expect([expected(busy).remaining, expected(busy).doneThisWeek, expected(busy).overdue]).toEqual([
    4, 2, 2,
  ])
  expect([expected(calm).remaining, expected(calm).doneThisWeek, expected(calm).overdue]).toEqual([
    1, 0, 0,
  ])

  for (const id of [busy, calm]) {
    const row = expected(id)
    await page.goto(`/projects/${id}`)
    await expect(page.getByRole('heading', { level: 1, name: row.projectName })).toBeVisible()
    // The chip beside the name is never the only carrier: the NAME is right there (WCAG 1.4.1).
    // It is a CONTROL now (it opens the colour picker, D74), so it is named rather than hidden --
    // the rule it has to keep is that colour is not the only thing saying which project this is.
    await expect(header(page).locator(`[data-project-chip="${id}"]`)).toHaveAccessibleName(
      'Project colour',
    )
    await expect(stat(page, 'Open'), row.projectName).toHaveText(String(row.remaining))
    await expect(stat(page, 'Done this week'), row.projectName).toHaveText(String(row.doneThisWeek))
    await expect(stat(page, 'Overdue'), row.projectName).toHaveText(String(row.overdue))
    // The day is the SERVER's, read back in the app's words. `quietDays` is the server's own
    // arithmetic in the user's timezone, so nothing here depends on this machine's clock.
    expect(row.quietDays).toBe(0)
    await expect(stat(page, 'Last activity'), row.projectName).toHaveText('Today')
  }

  // A quiet line says the DAY it last moved, not "Today" -- which is the number's whole point.
  backdateProjectActivity(calm, '9 days')
  await page.goto(`/projects/${calm}`)
  const quiet = (await movementOf(page)).find((r) => r.projectId === calm)!
  expect(quiet.quietDays).toBe(9)
  const [, month, day] = quiet.lastActivityOn!.split('-').map(Number)
  await expect(stat(page, 'Last activity')).toHaveText(`${MONTHS[month! - 1]} ${day}`)
})

/**
 * The banner is a live number, not a page-load snapshot. It is also the reason the movement
 * refetch is no longer awaited by the create path (api/taskCache.ts): the typist waits for the
 * row, not for the count. That change would be invisible if nothing asserted the count still
 * catches up -- and silently stale is exactly how a number stops being worth reading.
 */
test('the header’s numbers follow a task added on the page, without a reload', async ({ page }) => {
  await registerFreshUser(page)
  await page.setViewportSize(WIDE)
  const pid = await makeProject(page, '会变的线')
  await makeTask(page, pid, '本来就有的')
  await page.goto(`/projects/${pid}`)
  await expect(stat(page, 'Open')).toHaveText('1')

  await page.getByRole('textbox', { name: 'New task' }).fill('刚加的')
  await page.getByRole('textbox', { name: 'New task' }).press('Enter')
  await expect(page.getByRole('button', { name: 'Task: 刚加的', exact: true })).toBeVisible()
  await expect(stat(page, 'Open')).toHaveText('2')
  // ...and the server agrees, so this is not a count the page made up on its own.
  expect((await movementOf(page)).find((r) => r.projectId === pid)!.remaining).toBe(2)
})

/**
 * Separate from the counts on purpose: the test above passes unchanged with a bar sitting beside
 * them. Rollup is M3 and nothing writes `manual_progress`, so a ratio in this banner would be a
 * number the backend cannot cash (spec §5).
 */
test('the project header draws a percentage but never a progress bar', async ({ page }) => {
  await registerFreshUser(page)
  await page.setViewportSize(WIDE)
  const pid = await makeProject(page, '有进展的线')
  for (const t of ['做完一', '做完二']) await makeTask(page, pid, t, { status: 'done' })
  await makeTask(page, pid, '没做的')
  await makeTask(page, pid, '写了进度的', { manualProgress: 0.5 })

  await page.goto(`/projects/${pid}`)
  const banner = header(page)
  await expect(stat(page, 'Done this week')).toHaveText('2')

  // THE NUMBER IS BACK, THE BAR IS NOT. It was absent entirely until 2026-10-08 because the data
  // did not exist -- `manual_progress` was written by nothing and the rollup was unbuilt. It is
  // the mean of the four root tasks (1 + 1 + 0 + 0.5) / 4, the same §7.2 rule a parent gets.
  await expect(stat(page, 'Progress')).toHaveText('63%')
  // A BAR is still refused: a 60% line and a 60% line nobody has touched for three weeks draw
  // the same bar, and Last activity beside it is the metric §7.4 calls the valuable one.
  await expect(banner.getByRole('progressbar')).toHaveCount(0)
  await expect(banner.locator('progress, meter')).toHaveCount(0)
  // A bar built by hand: an element whose width is a fraction of its parent.
  const proportional = await banner.evaluate(
    (el) =>
      [...el.querySelectorAll<HTMLElement>('*')].filter((n) => {
        const width = n.style.width || getComputedStyle(n).getPropertyValue('--progress')
        return width.includes('%')
      }).length,
  )
  expect(proportional, 'elements sized by a percentage inside the project header').toBe(0)
})

// -------------------------------------------------------- the tree in a panel, the detail beside it

test('the tree is a panel spanning two columns and the detail is the third, at 1440', async ({
  page,
}) => {
  await registerFreshUser(page)
  await page.setViewportSize(WIDE)
  const pid = await makeProject(page, '三栏')
  await makeTask(page, pid, '被打开的任务')
  await makeTask(page, pid, '旁边的任务')
  await page.goto(`/projects/${pid}`)

  const treePanel = page.getByRole('region', { name: 'Tasks', exact: true })
  // The tree is INSIDE the panel, not beside it: a panel drawn around nothing would otherwise pass.
  await expect(treePanel.locator('[data-task-tree]')).toHaveCount(1)
  // The banner is above it and the full width of the content area.
  const bannerBox = (await header(page).boundingBox())!
  const closedBox = (await treePanel.boundingBox())!
  expect(bannerBox.y + bannerBox.height).toBeLessThanOrEqual(closedBox.y + 1)
  expect(Math.round(bannerBox.width)).toBe(Math.round(closedBox.width))

  await openDetail(page, '被打开的任务')
  const dialog = page.getByRole('dialog', { name: 'Task details' })
  await expect(dialog).toHaveAttribute('data-detail-mode', 'pane')
  // No layer over the page: as a column, a click on the tree is a click on the tree.
  await expect(page.locator('[data-detail-backdrop]')).toHaveCount(0)

  const paneBox = (await dialog.boundingBox())!
  const openBox = (await treePanel.boundingBox())!
  // Beside, not under -- and the tree panel really gave up the width rather than being covered.
  expect(openBox.x + openBox.width).toBeLessThanOrEqual(paneBox.x + 1)
  // TWO of the three columns against ONE: the ratio, not merely "wider than". A grid that gave the
  // detail half the content area, or a sliver of it, fails here while passing "it is to the left".
  const ratio = openBox.width / paneBox.width
  expect(ratio, `tree ${openBox.width} : detail ${paneBox.width}`).toBeGreaterThan(1.8)
  expect(ratio, `tree ${openBox.width} : detail ${paneBox.width}`).toBeLessThan(2.4)

  // It coexists: the tree is still operable, and clicking another row loads it into the same
  // column with no closing step in between.
  await page.getByRole('listitem').filter({ hasText: '旁边的任务' }).click()
  // Reading mode, so the task's name is the pane's heading rather than the value of an
  // input (rows-and-reading §5). The claim is unchanged: the OTHER row's task is now in the
  // same pane, with no closing step in between.
  await expect(dialog.locator('[data-detail-title]')).toHaveText('旁边的任务')
  // ...and the detail wears the page's own panel surface rather than a chrome plane, which is what
  // makes it read as part of the page instead of a form bolted to the window's edge.
  const [paneBg, panelBg] = await Promise.all([
    dialog.evaluate((el) => getComputedStyle(el).backgroundColor),
    treePanel.evaluate((el) => getComputedStyle(el).backgroundColor),
  ])
  expect(paneBg).toBe(panelBg)
})

/**
 * The same rule from the other end, with the focus trap asserted in BOTH directions. A trap in a
 * column that covers nothing locks the reader out of a list they can plainly see (WCAG 2.1.2); no
 * trap in a layer walks focus into a page nobody can see.
 */
test('the detail traps the keyboard at 1024 and does not at 1440', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '焦点')
  await makeTask(page, pid, '开着的任务')

  const inside = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))
  /** Presses Tab up to 40 times and says whether focus ever left the panel. */
  const escapes = async () => {
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab')
      if (!(await inside())) return true
    }
    return false
  }

  // --- a layer: the trap is on ---
  await page.setViewportSize(MEDIUM)
  await page.goto(`/projects/${pid}`)
  await openDetail(page, '开着的任务')
  const dialog = page.getByRole('dialog', { name: 'Task details' })
  await expect(dialog).toHaveAttribute('data-detail-mode', 'overlay')
  await expect(page.locator('[data-detail-backdrop]')).toHaveCount(1)
  await expect(dialog).toBeFocused()
  expect(await escapes(), 'Tab stays inside the overlay').toBe(false)

  // --- a column: the trap is off ---
  await page.setViewportSize(WIDE)
  await page.goto(`/projects/${pid}`)
  await openDetail(page, '开着的任务')
  await expect(dialog).toHaveAttribute('data-detail-mode', 'pane')
  await expect(dialog).toBeFocused()
  expect(await escapes(), 'Tab leaves the column').toBe(true)
  // Leaving it with Tab is not dismissing it, and Escape still closes it onto the row it came from.
  await expect(dialog).toBeVisible()
  // Pressed from inside the pane. In reading mode the control to press it on is Edit ('exact'
  // because "Keep editing" contains it); what is pinned is that Escape from inside still closes.
  await dialog.getByRole('button', { name: 'Edit', exact: true }).press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Task: 开着的任务', exact: true })).toBeFocused()
})

/**
 * THE TRAP MUST BE BUILT ON TAB ORDER, NOT ON A SELECTOR -- the guard for the one thing swapping in
 * `tabbable` actually buys.
 *
 * The trap used to collect its candidates with
 * `querySelectorAll('input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"])')`
 * and filter them by the `disabled` ATTRIBUTE alone. Anything in that list that the keyboard cannot
 * actually reach -- `display:none`, `visibility:hidden`, `hidden`, `inert`, a folded `<details>` --
 * still counted, and if such a thing sorted LAST then `active === last` was never true: the wrap
 * never fired and Tab walked out of a panel the reader cannot see past. That is the same shape as
 * the WCAG 2.1.2 trap this project already shipped once.
 *
 * Today's panel happens to contain no such control, so the trap test above passes either way --
 * a mutation back to the old selector survived every one of the fifty-nine detail, pane and
 * workbench specs. So this test PUTS one there: a hidden button appended as the panel's last child
 * is exactly the DOM the old implementation mishandled, and the claim being pinned is that
 * membership of the cycle is decided by what the keyboard can reach.
 */
test('the overlay trap ignores a trailing control the keyboard cannot reach', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '隐藏控件')
  await makeTask(page, pid, '开着的任务')

  await page.setViewportSize(MEDIUM)
  await page.goto(`/projects/${pid}`)
  await openDetail(page, '开着的任务')
  const dialog = page.getByRole('dialog', { name: 'Task details' })
  await expect(dialog).toHaveAttribute('data-detail-mode', 'overlay')
  await expect(dialog).toBeFocused()

  // A button the selector matches and the keyboard can never land on, as the LAST child.
  const planted = await dialog.evaluate((panel) => {
    const probe = document.createElement('button')
    probe.type = 'button'
    probe.textContent = 'probe'
    probe.style.display = 'none'
    panel.append(probe)
    // It really is matched by the selector that used to be here, and really is unreachable.
    return (
      panel.querySelectorAll(
        'input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"])',
      ).length > 0 &&
      probe === panel.lastElementChild &&
      probe.offsetParent === null
    )
  })
  expect(planted, 'the hidden trailing button was planted').toBe(true)

  const inside = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    expect(await inside(), `Tab press ${i + 1} left the overlay`).toBe(true)
  }
  // And the planted node never took focus either -- it cannot, which is the whole point.
  expect(await page.evaluate(() => document.activeElement?.textContent)).not.toBe('probe')
})

// ------------------------------------------------------------------------------ the rail, and the row

/**
 * ONE SPINE, not a column of dashes. Stage 2 of the previous redesign recorded a segmented rail as
 * a defect it had to fix, and a segmented rail passes every assertion about colour, count and x --
 * the only thing that tells the two apart is whether there is a GAP between one row's rail and the
 * next's, and whether each rail is as tall as the row it belongs to.
 */
test('the tree’s rail reads as one continuous spine, not one dash per row', async ({ page }) => {
  await registerFreshUser(page)
  await page.setViewportSize(WIDE)
  const pid = await makeProject(page, '一条脊')
  const a = await makeTask(page, pid, '根')
  const b = await makeTask(page, pid, '子', {}, a)
  await makeTask(page, pid, '孙', {}, b)
  await makeTask(page, pid, '另一根')
  await page.goto(`/projects/${pid}`)
  await expect(page.locator('[data-task-tree] li[data-depth]')).toHaveCount(4)

  const geometry = await page.evaluate(() => {
    const rows = [...document.querySelectorAll<HTMLElement>('[data-task-tree] li[data-depth]')]
    return rows.map((row) => {
      const rail = row.querySelector<HTMLElement>('[data-project-rail]')!
      const r = rail.getBoundingClientRect()
      const b = row.getBoundingClientRect()
      return {
        x: Math.round(r.x),
        top: r.top,
        bottom: r.bottom,
        rowTop: b.top,
        rowBottom: b.bottom,
        rowHeight: Math.round(b.height),
        radius: getComputedStyle(rail).borderTopLeftRadius,
      }
    })
  })
  expect(geometry).toHaveLength(4)
  // One x: a spine is vertical.
  expect(new Set(geometry.map((g) => g.x)).size, `rail x values`).toBe(1)
  for (const [i, g] of geometry.entries()) {
    // Each rail is EXACTLY as tall as its row -- a dash is inset top and bottom.
    expect(Math.round(g.bottom - g.top), `rail ${i} height`).toBe(g.rowHeight)
    expect(Math.abs(g.top - g.rowTop), `rail ${i} top`).toBeLessThanOrEqual(0.5)
    // ...and square, so two rails meeting read as one bar rather than two lozenges.
    expect(g.radius, `rail ${i} radius`).toBe('0px')
  }
  // No gap anywhere down the tree: the bottom of each rail is the top of the next.
  for (let i = 1; i < geometry.length; i++) {
    expect(geometry[i]!.top - geometry[i - 1]!.bottom, `gap above row ${i}`).toBeLessThanOrEqual(
      0.5,
    )
  }
  // The spine covers the whole tree, top to bottom, rather than most of it.
  expect(geometry[0]!.top - geometry[0]!.rowTop).toBeLessThanOrEqual(0.5)
  expect(geometry.at(-1)!.rowBottom - geometry.at(-1)!.bottom).toBeLessThanOrEqual(0.5)
})

/**
 * The workbench's row metric, on the densest list in the app. 44px for a single-line row is the
 * size stage 1 settled on (spec §4's band, measured against what had actually shipped rather than
 * against the 28-30 the section quotes); the tree is the page where a row being too small to
 * read at a glance was worst.
 */
test('a single-line tree row is 44px tall, at every depth', async ({ page }) => {
  await registerFreshUser(page)
  await page.setViewportSize(WIDE)
  const pid = await makeProject(page, '行高')
  const a = await makeTask(page, pid, '一层')
  const b = await makeTask(page, pid, '二层', {}, a)
  await makeTask(page, pid, '三层', {}, b)
  await page.goto(`/projects/${pid}`)
  await expect(page.locator('[data-task-tree] li[data-depth]')).toHaveCount(3)

  const heights = await page
    .locator('[data-task-tree] li[data-depth]')
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)))
  expect(heights).toEqual([44, 44, 44])
  // The marker inside it is the workbench's 20px, not a 16px glyph left sitting in a taller row.
  expect(
    await page
      .getByRole('img', { name: 'To do' })
      .first()
      .evaluate((el) => el.getBoundingClientRect().width),
  ).toBe(20)
})

// ----------------------------------------------------------------------------------- the phone
