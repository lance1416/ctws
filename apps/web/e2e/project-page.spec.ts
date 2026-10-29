import { expect, test, type Page } from '@playwright/test'
import {
  apiPost,
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

  // The square is the project's own; its colour and name are changed on the edit page
  // (DES-001 v1.23), so neither is a control here.
  await expect(header(page).getByText('JH', { exact: true })).toBeVisible()
  await expect(header(page).getByRole('heading', { level: 1 })).toHaveText('Job hunt')
  await expect(header(page).getByRole('button', { name: 'Project colour' })).toHaveCount(0)
  await expect(header(page).getByRole('button', { name: 'Job hunt' })).toHaveCount(0)
  const views = header(page).getByRole('tablist', { name: 'View' })
  await expect(views.getByRole('tab', { name: 'Tree' })).toHaveAttribute('aria-selected', 'true')
  await expect(views.getByRole('tab', { name: 'Board' })).toHaveAttribute('aria-selected', 'false')
  // One Tab stop for the switch, and each tab names what it switches (BUG-061).
  await expect(views.getByRole('tab', { name: 'Board' })).toHaveAttribute('tabindex', '-1')
  const shown = await views.getByRole('tab', { name: 'Tree' }).getAttribute('aria-controls')
  await expect(page.locator(`[id="${shown!}"]`)).toBeVisible()
  await views.getByRole('tab', { name: 'Tree' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(views.getByRole('tab', { name: 'Board' })).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL(/view=board/)
  await expect(page.locator('#project-board')).toBeVisible()
  await expect(
    page.getByRole('tablist', { name: 'Columns' }).getByRole('tab', { name: 'Status' }),
  ).toHaveAttribute('aria-controls', 'project-board')
  await page.keyboard.press('ArrowLeft')
  await expect(headNew(page)).toBeVisible()
  // Archive is in More now, not a button of its own (FR-052).
  await expect(header(page).getByRole('button', { name: 'Archive', exact: true })).toHaveCount(0)
  await header(page).getByRole('button', { name: 'More' }).click()
  await expect(page.getByRole('menuitem', { name: 'Archive' })).toBeVisible()
})

test('the inbox’s More edits it, and never archives it', async ({ page }) => {
  await registerFreshUser(page)
  await openProject(page, 'Inbox')
  await header(page).getByRole('button', { name: 'More' }).click()
  await expect(page.getByRole('menuitem', { name: 'Edit project' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /Archive/ })).toHaveCount(0)
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
  // An address that cannot be followed is refused, and the field says why as it is typed
  // (BUG-035); a scheme still being typed is not.
  const refused = await pin('example.com')
  const why = refused.getByText('Use an address that starts with https://')
  await expect(why).toBeVisible()
  await expect(refused.getByLabel('Address')).toHaveAttribute('aria-invalid', 'true')
  await expect(refused.getByRole('button', { name: 'Pin' })).toBeDisabled()
  await refused.getByLabel('Address').fill('javascript:alert(1)')
  await expect(why).toBeVisible()
  await refused.getByLabel('Address').fill('http')
  await expect(why).toHaveCount(0)
  await refused.getByLabel('Address').press('Escape')

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
  // The head is above it.
  const bannerBox = (await header(page).boundingBox())!
  const closedBox = (await treePanel.boundingBox())!
  expect(bannerBox.y + bannerBox.height).toBeLessThanOrEqual(closedBox.y + 1)

  await openDetail(page, '被打开的任务')
  const dialog = page.getByRole('dialog', { name: 'Task details' })
  await expect(dialog).toHaveAttribute('data-detail-mode', 'pane')
  // No layer over the page: as a column, a click on the tree is a click on the tree.
  await expect(page.locator('[data-detail-backdrop]')).toHaveCount(0)

  const paneBox = (await dialog.boundingBox())!
  const openBox = (await treePanel.boundingBox())!
  // Beside, not under -- and the tree panel really gave up the width rather than being covered.
  expect(openBox.x + openBox.width).toBeLessThanOrEqual(paneBox.x + 1)
  // The detail is the inspector's width (tokens.md, 400) and the tree keeps the rest: the
  // ratio, not merely "wider than". A grid that gave the detail half the content area, or a sliver
  // of it, fails here while passing "it is to the left".
  expect(Math.round(paneBox.width)).toBe(400)
  const ratio = openBox.width / paneBox.width
  expect(ratio, `tree ${openBox.width} : detail ${paneBox.width}`).toBeGreaterThan(1.6)
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

test('a delete question asked on one project does not follow to the next', async ({ page }) => {
  await registerFreshUser(page)
  await page.setViewportSize(WIDE)
  const a = await makeProject(page, 'Alpha')
  await makeTask(page, a, 'Only in Alpha')
  const b = await makeProject(page, 'Beta')
  await page.goto(`/projects/${b}`)
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Edit project' }).click()
  await page.goto(`/projects/${a}/edit`)
  await page.getByRole('button', { name: /^Delete / }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()

  // The question is modal, so the page under it cannot be clicked; Back still leaves it.
  await page.goBack()
  await expect(page).toHaveURL(`/projects/${b}/edit`)
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Beta')
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
})

test('the delete question still asks when counting what goes with the project fails', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Alpha')
  await page.goto(`/projects/${pid}/edit`)
  await page.route(`**/api/v1/tasks?projectId=${pid}`, (r) => r.fulfill({ status: 500 }))
  await page.getByRole('button', { name: /^Delete / }).click()
  const ask = page.getByRole('alertdialog')
  await expect(ask).toContainText('Delete Alpha? Everything in it goes.')
  await expect(ask.getByRole('button', { name: /^Delete/ })).toBeEnabled()
})

test('the tree says it is reading, or that it could not, and is never an empty project then', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Slow')
  await makeTask(page, pid, 'Somewhere')
  const tree = page.getByRole('region', { name: 'Tasks' })

  // BUG-039: held back, it draws grey rows under its column names, and no "New task" yet.
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/api/v1/tasks?projectId=*', async (route) => {
    await held
    await route.continue()
  })
  await page.goto(`/projects/${pid}`)
  await expect(tree.locator('[aria-busy="true"]')).toBeVisible()
  await expect(tree.getByRole('textbox', { name: 'New task' })).toHaveCount(0)
  await expect(page.getByText('No tasks in this project yet')).toHaveCount(0)
  release()
  await expect(tree.getByRole('listitem').filter({ hasText: 'Somewhere' })).toBeVisible()
  await page.unroute('**/api/v1/tasks?projectId=*')

  // Failing, it says so in its block with a way to try again, which brings the rows back.
  let failing = true
  await page.route('**/api/v1/tasks?projectId=*', (route) =>
    failing ? route.fulfill({ status: 500, body: '{}' }) : route.continue(),
  )
  await page.reload()
  await expect(tree.getByRole('alert')).toHaveText('Couldn’t load the tasks.')
  await expect(tree.getByRole('textbox', { name: 'New task' })).toHaveCount(0)
  failing = false
  await tree.getByRole('button', { name: 'Try again' }).click()
  await expect(tree.getByRole('listitem').filter({ hasText: 'Somewhere' })).toBeVisible()
})

test('a node linked to an organisation carries its mark after the name', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Job hunt')
  const stripe = await makeTask(page, pid, 'Stripe')
  await makeTask(page, pid, 'Update the CV')
  const org = await apiPost(page, '/organisations', { name: 'Stripe' })
  await apiPost(page, '/relations', {
    from: { type: 'task', id: stripe },
    to: { type: 'organisation', id: org.id },
  })
  await page.goto(`/projects/${pid}`)

  // BUG-033: the building after the name, saying which, and on no other row.
  const row = page.locator('[data-task-tree] li').filter({ hasText: 'Stripe' })
  await expect(row.locator('[data-row-organisation]')).toHaveAttribute('title', 'Stripe')
  await expect(page.locator('[data-row-organisation]')).toHaveCount(1)
})

test('the open project’s outline in the sidebar lists its parents and its own leaves', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Job hunt')
  const amazon = await makeTask(page, pid, 'Amazon')
  const role = await makeTask(page, pid, 'SDE II, AWS Payments', {}, amazon)
  await makeTask(page, pid, 'System design round', {}, role)
  await makeTask(page, pid, 'Update the LinkedIn headline')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/projects/${pid}`)

  // P-01, artboard 8: parents at every depth and the project's own leaves, in the tree's order;
  // a leaf under a parent is the page's to show.
  const outline = page
    .getByRole('complementary', { name: 'Projects' })
    .locator('[data-project-outline]')
  await expect(outline.locator('[data-outline-title]')).toHaveText([
    'Amazon',
    'SDE II, AWS Payments',
    'Update the LinkedIn headline',
  ])
  // A click opens it on the page, in the inspector.
  await outline.getByRole('button', { name: 'SDE II, AWS Payments' }).click()
  await expect(
    page.getByRole('dialog', { name: 'Task details' }).locator('[data-detail-title]'),
  ).toHaveText('SDE II, AWS Payments')
  await expect(outline.getByRole('button', { name: 'SDE II, AWS Payments' })).toHaveAttribute(
    'aria-current',
    'true',
  )
})

test('the inbox is a tree to empty: Move to… takes a line to a project', async ({ page }) => {
  await registerFreshUser(page)
  const ctws = await makeProject(page, 'CTWS')
  const projects = (await (await page.request.get('/api/v1/projects')).json()) as
    { id: string; isInbox: boolean }[] | { projects: { id: string; isInbox: boolean }[] }
  const list = Array.isArray(projects) ? projects : projects.projects
  const inbox = list.find((p) => p.isInbox)!.id
  for (const t of ['想到的一句', '另一句']) await makeTask(page, inbox, t)
  await page.goto(`/projects/${inbox}?view=board`)

  // FR-059: no Tree and Board here, and the tree whatever the address says.
  await expect(page.getByRole('tab', { name: 'Board' })).toHaveCount(0)
  await expect(page.locator('[data-task-tree]')).toBeVisible()

  const row = page.locator('[data-task-tree] li').filter({ hasText: '想到的一句' })
  await row.hover()
  await row.getByRole('button', { name: 'Move “想到的一句” to…' }).click()
  const picker = page.getByRole('dialog').filter({ hasText: 'Move “想到的一句” to' })
  await picker.getByRole('combobox', { name: 'Search' }).fill('CT')
  // Projects only, and never the inbox it is in.
  await expect(picker.getByRole('option')).toHaveCount(1)
  await picker.getByRole('option', { name: /CTWS/ }).click()

  await expect(picker).toHaveCount(0)
  await expect(row).toHaveCount(0)
  await expect(page.locator('[data-task-tree] li')).toHaveCount(1)
  const moved = await page.request.get(`/api/v1/tasks?projectId=${ctws}`)
  expect(
    ((await moved.json()) as { tasks: { title: string }[] }).tasks.map((t) => t.title),
  ).toEqual(['想到的一句'])

  // From the keyboard: M on a focused row opens the same picker (TC-574), and the help says so.
  await page.getByRole('button', { name: 'Task: 另一句', exact: true }).focus()
  await page.keyboard.press('m')
  await expect(page.getByRole('dialog').filter({ hasText: 'Move “另一句” to' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('?')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toContainText(
    'Move to a project, in the inbox',
  )
})

test('Move to… goes inside a project to put a line under one of its parents', async ({ page }) => {
  await registerFreshUser(page)
  const jh = await makeProject(page, 'Job hunt')
  await makeProject(page, 'Journal')
  const amazon = await makeTask(page, jh, 'Amazon')
  await makeTask(page, jh, 'Phone screen', {}, amazon)
  const stripe = await makeTask(page, jh, 'Stripe')
  await makeTask(page, jh, 'Take-home', {}, stripe)
  await makeTask(page, jh, 'A leaf')
  const projects = (await (await page.request.get('/api/v1/projects')).json()) as {
    projects: { id: string; isInbox: boolean }[]
  }
  const inbox = projects.projects.find((p) => p.isInbox)!.id
  await makeTask(page, inbox, 'Ask about the team')
  await page.goto(`/projects/${inbox}`)

  // FR-059, the acceptance: M, "job", →, Amazon, Enter.
  await page.getByRole('button', { name: 'Task: Ask about the team', exact: true }).focus()
  await page.keyboard.press('m')
  const picker = page.getByRole('dialog').filter({ hasText: 'Move “Ask about the team” to' })
  await page.keyboard.type('j')
  // A project with parents ends in "›"; one without has none.
  await expect(picker.getByRole('option', { name: /Journal/ })).toBeVisible()
  await expect(picker.getByRole('button', { name: 'Inside “Journal”' })).toHaveCount(0)
  await expect(picker.getByRole('button', { name: 'Inside “Job hunt”' })).toBeVisible()
  await page.keyboard.type('ob')
  await expect(picker.getByRole('option')).toHaveCount(1)
  await page.keyboard.press('ArrowRight')

  // The parents, in the tree's order, no leaves and no "Top of" row; ← would go back.
  const parents = picker.getByRole('listbox', { name: 'Parents in Job hunt' })
  await expect(parents.getByRole('option')).toHaveText([/Amazon$/, /Stripe$/])
  await page.keyboard.press('ArrowLeft')
  await expect(picker.getByRole('option', { name: /Job hunt/ })).toBeVisible()
  await expect(picker.getByRole('combobox', { name: 'Search' })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(parents.getByRole('option')).toHaveText([/Amazon$/, /Stripe$/])
  await page.keyboard.type('ama')
  await expect(parents.getByRole('option')).toHaveCount(1)
  await page.keyboard.press('Enter')

  await expect(picker).toHaveCount(0)
  await expect(
    page.getByRole('status').filter({ hasText: 'Moved to Job hunt › Amazon' }),
  ).toBeVisible()
  const under = (await (await page.request.get(`/api/v1/tasks?projectId=${jh}`)).json()) as {
    tasks: { title: string; parentId: string | null }[]
  }
  expect(under.tasks.find((t) => t.title === 'Ask about the team')?.parentId).toBe(amazon)
})

test('M does nothing on a row outside the inbox', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'CTWS')
  await makeTask(page, pid, 'A line')
  await page.goto(`/projects/${pid}`)
  await page.getByRole('button', { name: 'Task: A line', exact: true }).focus()
  await page.keyboard.press('m')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
