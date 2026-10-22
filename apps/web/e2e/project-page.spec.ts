import { expect, test, type Page } from '@playwright/test'
import {
  headNew,
  makeProject,
  makeTask,
  openDetail,
  openProject,
  registerFreshUser,
} from './helpers'

/**
 * THE PROJECT PAGE as a workbench: the header banner carrying this line of
 * work's state, the tree in a panel, and the detail as the third column rather than a layer.
 *
 * What these guards are for, in order of how easy each would be to fake:
 * - "the four numbers are right" is not provable by reading numbers off the screen and comparing
 *   them to numbers the test also computed. They are compared against the SERVER's own answer,
 *   per project, so a banner that counted client-side would have to agree with the query that
 *   produced it. Two projects with different numbers, visited one after the other, because a
 *   banner showing workspace-wide totals passes any one-project assertion.
 * - "the detail is a column, not a layer" is only provable from BOTH ends of the width rule, and
 *   the focus trap has to be asserted present at one end and absent at the other -- a pane that
 *   always traps passes an overlay-only test, and one that never traps passes a pane-only test.
 * - "the rail is one spine" is a claim about drawn ink: a column of per-row dashes and an unbroken
 *   bar both have one rail per row at one x. Only the gaps between them tell the two apart.
 */
const WIDE = { width: 1440, height: 1000 }
// 1024: the widest viewport still BELOW the 1280 threshold, so it is the case a min-width rule
// gets wrong most easily.
const MEDIUM = { width: 1024, height: 800 }
const header = (page: Page) =>
  page.getByRole('region', { name: 'Project at a glance', exact: true })

// ------------------------------------------------------------------------------- the head

test('the head is the square and name, the views, New and More (FR-053)', async ({ page }) => {
  await registerFreshUser(page)
  const id = await makeProject(page, 'Job hunt')
  await page.goto(`/projects/${id}`)

  // The square is the project's own, and opens its colours.
  const square = header(page).locator(`[data-project-chip="${id}"]`)
  await expect(square).toHaveAccessibleName('Project colour')
  await expect(square).toHaveText('JH')
  await expect(header(page).getByRole('heading', { level: 1 })).toHaveText('Job hunt')
  const views = header(page).getByRole('tablist', { name: 'View' })
  await expect(views.getByRole('tab', { name: 'Tree' })).toHaveAttribute('aria-selected', 'true')
  await expect(views.getByRole('tab', { name: 'Board' })).toHaveAttribute('aria-selected', 'false')
  await expect(headNew(page)).toBeVisible()
  // Archive is in More now, not a button of its own (FR-052).
  await expect(header(page).getByRole('button', { name: 'Archive', exact: true })).toHaveCount(0)
  await header(page).getByRole('button', { name: 'More' }).click()
  await expect(page.getByRole('menuitem', { name: 'Archive' })).toBeVisible()
})

test('the inbox has no More: there is nothing in it to do to the inbox', async ({ page }) => {
  await registerFreshUser(page)
  await openProject(page, 'Inbox')
  await expect(header(page).getByRole('button', { name: 'More' })).toHaveCount(0)
})

test('the view is in the address, and B switches it', async ({ page }) => {
  await registerFreshUser(page)
  const id = await makeProject(page, 'P')
  await makeTask(page, id, '一条')
  await page.goto(`/projects/${id}`)
  const tab = (name: string) => header(page).getByRole('tab', { name })

  await tab('Board').click()
  await expect(page).toHaveURL(new RegExp(`/projects/${id}\\?view=board$`))
  await page.reload()
  await expect(tab('Board')).toHaveAttribute('aria-selected', 'true')
  // B from the page, not from a field.
  await page.keyboard.press('b')
  await expect(tab('Tree')).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL(new RegExp(`/projects/${id}$`))
})

test('a pinned resource is a chip with its digit, and the digit opens it (FR-046)', async ({
  page,
}) => {
  await registerFreshUser(page)
  const id = await makeProject(page, 'Job hunt')
  // Outside addresses answer from here: the test is about which one opens, not the web.
  await page
    .context()
    .route(/^https:\/\/(docs\.google|github)\.com\//, (r) =>
      r.fulfill({ contentType: 'text/html', body: '<title>outside</title>' }),
    )
  await page.goto(`/projects/${id}`)
  const pinned = header(page).locator('[data-pinned-resources]')
  // With none pinned, only the +.
  await expect(pinned.locator('[data-pinned]')).toHaveCount(0)

  const pin = async (url: string, name?: string) => {
    await header(page).getByRole('button', { name: 'Pin a resource' }).click()
    const form = page.getByRole('form', { name: 'Pin a resource' })
    await form.getByLabel('Address').fill(url)
    if (name) await form.getByLabel('Name (optional)').fill(name)
    return form
  }
  const first = await pin('https://docs.google.com/document/d/abc/edit', 'CV master')
  // Told what it is before it is pinned.
  await expect(first.locator('[data-recognised]')).toHaveText('Google Docs')
  await first.getByRole('button', { name: 'Pin' }).click()
  await expect(pinned.locator('[data-pinned="1"]')).toHaveText('CV master1')

  // A pull request with no name of its own is called by its number.
  await (await pin('https://github.com/o/r/pull/12')).getByRole('button', { name: 'Pin' }).click()
  await expect(pinned.locator('[data-pinned="2"]')).toHaveText('#122')

  // The digit opens it, in a tab of its own; the server kept both, in their places.
  const opened = page.waitForEvent('popup')
  await page.keyboard.press('2')
  expect((await opened).url()).toBe('https://github.com/o/r/pull/12')
  await page.reload()
  await expect(pinned.locator('[data-pinned]')).toHaveText(['CV master1', '#122'])
})

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
  // The head is above it; beside it, with the detail closed, is what the project meets.
  const bannerBox = (await header(page).boundingBox())!
  const closedBox = (await treePanel.boundingBox())!
  expect(bannerBox.y + bannerBox.height).toBeLessThanOrEqual(closedBox.y + 1)
  const aside = (await page.locator('[data-panel="Linked"]').boundingBox())!
  expect(aside.x).toBeGreaterThanOrEqual(closedBox.x + closedBox.width)

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
  // Reading mode, so the task's name is the pane's heading rather than the value of an input.
  await expect(dialog.locator('[data-detail-title]')).toHaveText('旁边的任务')
  // ...and the detail is a sheet laid over the page -- the `float` surface -- while the tree's
  // section is no box at all, so the one thing that floats is the one thing that looks it.
  const [paneBg, panelBg, float] = await Promise.all([
    dialog.evaluate((el) => getComputedStyle(el).backgroundColor),
    treePanel.evaluate((el) => getComputedStyle(el).backgroundColor),
    page.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.backgroundColor = 'var(--color-float)'
      document.body.appendChild(probe)
      const c = getComputedStyle(probe).backgroundColor
      probe.remove()
      return c
    }),
  ])
  expect(paneBg).toBe(float)
  expect(panelBg).toBe('rgba(0, 0, 0, 0)')
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
  // It lies over the centre column rather than beside it, and a press outside it closes it.
  const overBox = (await dialog.boundingBox())!
  const main = (await page.locator('main').first().boundingBox())!
  expect(main.x + main.width).toBeGreaterThan(overBox.x + 1)
  await page.locator('[data-detail-backdrop]').click({ position: { x: 5, y: 5 } })
  await expect(dialog).toHaveCount(0)

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
 * THE TRAP IS BUILT ON TAB ORDER, NOT ON A SELECTOR. A control the keyboard cannot reach
 * (`display:none`, `hidden`, `inert`, a folded `<details>`) sorting last must not stop the wrap, or
 * Tab walks out of a panel the reader cannot see past. The panel has no such control of its own,
 * so this plants one as its last child.
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
    // It is in the DOM, it is last, and the keyboard cannot reach it -- which is the whole case.
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
 * ONE SPINE, not a column of dashes. A segmented rail passes every assertion about colour, count
 * and x; only the GAP between one row's rail and the next's, and whether each rail is as tall as
 * its row, tell the two apart.
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
        width: Math.round(r.width),
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
    expect(g.width, `rail ${i} width`).toBe(3)
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

test('a delete question asked on one project does not follow to the next', async ({ page }) => {
  await registerFreshUser(page)
  await page.setViewportSize(WIDE)
  const a = await makeProject(page, 'Alpha')
  await makeTask(page, a, 'Only in Alpha')
  const b = await makeProject(page, 'Beta')
  await page.goto(`/projects/${b}`)
  await page
    .getByRole('navigation', { name: 'Projects' })
    .getByRole('link', { name: 'Alpha' })
    .click()
  await page.getByRole('button', { name: /^Delete / }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()

  // The question is modal, so the page under it cannot be clicked; Back still leaves it.
  await page.goBack()
  await expect(page).toHaveURL(`/projects/${b}`)
  await expect(header(page)).toContainText('Beta')
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
})

test('the delete question still asks when counting what goes with the project fails', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Alpha')
  await page.goto(`/projects/${pid}`)
  await page.route(`**/api/v1/tasks?projectId=${pid}`, (r) => r.fulfill({ status: 500 }))
  await page.getByRole('button', { name: /^Delete / }).click()
  const ask = page.getByRole('alertdialog')
  await expect(ask).toContainText('Delete Alpha? Everything in it goes.')
  await expect(ask.getByRole('button', { name: /^Delete/ })).toBeEnabled()
})
