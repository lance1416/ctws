import { expect, test, type Page } from '@playwright/test'
import {
  isMove,
  recordMoves,
  registerFreshUser,
  seedTasks,
  serverTasks,
  startProject,
  captureBox,
  openCapture,
  keyAsShown,
} from './helpers'

const handle = (page: Page, title: string) =>
  page.getByRole('button', { name: `Task: ${title}`, exact: true })

const row = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title })

/** Is focus on a row of the task tree? */
const inTree = (page: Page) =>
  page.evaluate(() => !!document.activeElement?.closest('[data-task-tree]'))

/** How many of the tree's rows are in the tab order. A roving tabindex means exactly one. */
const tabStops = (page: Page) =>
  page.evaluate(
    () =>
      document.querySelectorAll('[data-task-tree] [data-handle-id]:not([tabindex="-1"])').length,
  )

/** The first tab stop after the tree's rows: the new-task box, its last line (FR-054). */
const belowTree = (page: Page) => page.getByRole('textbox', { name: 'New task' })

const flat = (n: number): [string, null][] =>
  Array.from({ length: n }, (_, i) => [`r${i}`, null] as [string, null])

/**
 * ONE TAB STOP FOR THE WHOLE TREE, not one PER ROW. A two-row tree would pass with a stop per row
 * too, which is why it runs on twelve rows and asserts the press count, not merely that Tab
 * eventually gets out.
 */
test('the whole tree is one tab stop, however many rows it has', async ({ page }) => {
  await registerFreshUser(page)
  const url = await startProject(page, 'Many')
  await seedTasks(page, url, flat(12))
  const moves = recordMoves(page)

  expect(await tabStops(page)).toBe(1)

  // From the box under the rows, one Shift+Tab enters the tree and one more leaves it: two presses
  // whatever the number of rows.
  await belowTree(page).focus()
  await page.keyboard.press('Shift+Tab')
  expect(await inTree(page)).toBe(true)
  await page.keyboard.press('Shift+Tab')
  expect(await inTree(page)).toBe(false)

  // Tab is symmetric: back in, and back out to the box under the rows.
  await page.keyboard.press('Tab')
  expect(await inTree(page)).toBe(true)
  await page.keyboard.press('Tab')
  await expect(belowTree(page)).toBeFocused()

  // Tab is still bound to nothing: it reorganised nothing on the way through.
  expect(moves).toEqual([])
  await expect(page.getByRole('listitem')).toHaveText(flat(12).map(([t]) => new RegExp(t)))
})

test('the tab stop follows the row last used, so Tab re-enters where you left off', async ({
  page,
}) => {
  await registerFreshUser(page)
  const url = await startProject(page, 'Rove')
  await seedTasks(page, url, flat(5))

  await handle(page, 'r3').focus()
  expect(await tabStops(page)).toBe(1)
  await belowTree(page).focus()
  await page.keyboard.press('Shift+Tab')
  // Not r0: a roving tabindex that always snapped back to the first row would make Tab a way of
  // losing your place.
  await expect(handle(page, 'r3')).toBeFocused()
})

test('arrows and j/k move between rows and stop at the ends', async ({ page }) => {
  await registerFreshUser(page)
  const url = await startProject(page, 'Move')
  await seedTasks(page, url, flat(4))
  const moves = recordMoves(page)

  await handle(page, 'r0').focus()
  await page.keyboard.press('ArrowDown')
  await expect(handle(page, 'r1')).toBeFocused()
  await page.keyboard.press('j')
  await expect(handle(page, 'r2')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(handle(page, 'r1')).toBeFocused()
  await page.keyboard.press('k')
  await expect(handle(page, 'r0')).toBeFocused()

  // At the first row, up does nothing -- and in particular does not wrap to the last row, which
  // would silently lose the person's place.
  await page.keyboard.press('ArrowUp')
  await expect(handle(page, 'r0')).toBeFocused()
  await page.keyboard.press('k')
  await expect(handle(page, 'r0')).toBeFocused()

  await page.keyboard.press('End')
  await expect(handle(page, 'r3')).toBeFocused()
  // At the last row, down does nothing.
  await page.keyboard.press('ArrowDown')
  await expect(handle(page, 'r3')).toBeFocused()
  await page.keyboard.press('j')
  await expect(handle(page, 'r3')).toBeFocused()
  await page.keyboard.press('Home')
  await expect(handle(page, 'r0')).toBeFocused()

  // Moving the focus is not moving the row: nothing was reordered and nothing was sent.
  await expect(page.getByRole('listitem')).toHaveText([/r0/, /r1/, /r2/, /r3/])
  expect(moves).toEqual([])
})

test('plain left and right fold, unfold, and walk the hierarchy', async ({ page }) => {
  await registerFreshUser(page)
  const url = await startProject(page, 'Fold')
  await seedTasks(page, url, [
    ['p', null],
    ['c', 'p'],
    ['tail', null],
  ])
  const moves = recordMoves(page)

  await handle(page, 'p').focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('listitem')).toHaveCount(2)
  await expect(handle(page, 'p')).toBeFocused()
  // Collapsed already: left goes to the parent, and `p` is a root, so focus stays.
  await page.keyboard.press('ArrowLeft')
  await expect(handle(page, 'p')).toBeFocused()

  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('listitem')).toHaveCount(3)
  // Expanded already: right steps into the first child.
  await page.keyboard.press('ArrowRight')
  await expect(handle(page, 'c')).toBeFocused()
  // And from a leaf child, left climbs back to the parent.
  await page.keyboard.press('ArrowLeft')
  await expect(handle(page, 'p')).toBeFocused()

  // Depth is unchanged throughout: folding is not outdenting.
  await expect(row(page, 'c')).toHaveAttribute('data-depth', '2')
  expect(moves).toEqual([])
})

// The pre-existing keyboard model, re-pinned next to the new keys rather than only in the suites
// that already own each one: the roving tabindex touches the very handler they all run through.
test('Alt arrows still move and reparent rows, and Enter still opens the detail', async ({
  page,
}) => {
  await registerFreshUser(page)
  const url = await startProject(page, 'Keep')
  await seedTasks(page, url, flat(3))
  const projectId = url.split('/').pop()!

  const moved = page.waitForResponse((r) => isMove(r.request()) && r.ok())
  await handle(page, 'r2').focus()
  await page.keyboard.press('Alt+ArrowUp')
  await expect(page.getByRole('listitem')).toHaveText([/r0/, /r2/, /r1/])
  await moved

  const indented = page.waitForResponse((r) => isMove(r.request()) && r.ok())
  await page.keyboard.press('Alt+ArrowRight')
  await indented
  await expect(row(page, 'r2')).toHaveAttribute('data-depth', '2')

  // Read the server back rather than trusting the optimistic repaint.
  const body = await serverTasks(page, projectId)
  const tasks = body as { id: string; title: string; parentId: string | null }[]
  const byId = new Map(tasks.map((t) => [t.id, t.title]))
  const parents = Object.fromEntries(
    tasks.map((t) => [t.title, t.parentId ? byId.get(t.parentId) : null]),
  )
  expect(parents).toEqual({ r0: null, r1: null, r2: 'r0' })

  await handle(page, 'r1').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  // Focus returns to the row that opened it: the behaviour the roving tabindex must not disturb.
  await expect(handle(page, 'r1')).toBeFocused()

  // Shift+Enter adds a sibling, Alt+Enter a child: both still open their input.
  await page.keyboard.press('Shift+Enter')
  await expect(page.getByLabel('Add a task')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(handle(page, 'r1')).toBeFocused()
  await page.keyboard.press('Alt+Enter')
  await expect(page.getByLabel('Add a task')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(handle(page, 'r1')).toBeFocused()

  // `s` still starts the task.
  await page.keyboard.press('s')
  await expect(row(page, 'r1').getByRole('img', { name: 'In progress' })).toBeVisible()
})

test('the ? overlay lists the keys, closes on Escape and on a click outside', async ({ page }) => {
  await registerFreshUser(page)

  await page.keyboard.press('?')
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(dialog).toBeVisible()
  // The keys it must actually name (FR-029), each as its own cap, not merely "a dialog appeared".
  // Letters as capitals, as every other cap (artboard 24).
  for (const key of [
    await keyAsShown(page, 'Ctrl+K'),
    'C',
    '?',
    '[',
    'L',
    'Alt+Enter',
    'Shift+Enter',
    'S',
    'X',
  ]) {
    // `.first()`: a letter is also the second cap of a jump, and in the switch's line.
    await expect(dialog.getByText(key, { exact: true }).first()).toBeVisible()
  }
  // A key that changed says what it was, for the first release after the redesign.
  await expect(dialog.getByText('was f', { exact: true })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  await page.keyboard.press('?')
  await expect(dialog).toBeVisible()
  // Outside the panel: the scrim, at the very bottom left of the viewport.
  const { height } = page.viewportSize()!
  await page.mouse.click(5, height - 5)
  await expect(dialog).toHaveCount(0)

  // Typed into a field it is a question mark, not a shortcut.
  const box = await openCapture(page)
  await box.press('?')
  await expect(dialog).toHaveCount(0)
  await expect(box).toHaveValue('?')
})

test('G jumps to every place on the icon bar, and not while typing (FR-029)', async ({ page }) => {
  await registerFreshUser(page)

  for (const [key, url] of [
    ['p', /\/projects$/],
    ['v', /\/review$/],
    ['e', /\/people$/],
    ['r', /\/reading$/],
    ['m', /\/meetings$/],
    ['o', /\/organisations$/],
    ['x', /\/communication$/],
    ['n', /\/notes$/],
    ['c', /\/calendar$/],
    ['w', /\/$/],
    ['t', /\/today$/],
  ] as const) {
    await page.keyboard.press('g')
    await page.keyboard.press(key)
    await expect(page).toHaveURL(url)
  }

  // The jumps the redesign retired do nothing now.
  for (const gone of ['i', 'b', 'l']) {
    await page.keyboard.press('g')
    await page.keyboard.press(gone)
    await expect(page).toHaveURL(/\/today$/)
  }

  // In a text field, `g` then `p` is two letters of a word.
  const box = await openCapture(page)
  await box.press('g')
  await box.press('p')
  await expect(page).toHaveURL(/\/today$/)
  await expect(box).toHaveValue('gp')
})

test('the single-key shortcuts can be turned off, and stay off after a reload', async ({
  page,
}) => {
  await registerFreshUser(page)
  const url = await startProject(page, 'Off')
  await seedTasks(page, url, flat(3))

  // The switch lives in the overlay, which also has a button: with the keys off, `?` must not be
  // the only way back to the setting that turned them off.
  await page.getByRole('button', { name: 'Keys', exact: true }).click()
  const toggle = page.getByRole('switch', { name: /Single-key shortcuts/ })
  await expect(toggle).toBeChecked()
  await toggle.uncheck()
  await page.keyboard.press('Escape')

  await page.keyboard.press('?')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0)
  await page.keyboard.press('g')
  await page.keyboard.press('p')
  await expect(page).toHaveURL(new RegExp(`/projects/${url.split('/').pop()!}`))
  await page.getByRole('heading', { name: 'Off' }).click()
  await page.keyboard.press('c')
  await expect(captureBox(page)).toHaveCount(0)
  // Ctrl K is not a single key: a modified press is a command, and it still searches.
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('combobox', { name: 'Search' })).toBeFocused()
  await page.keyboard.press('Escape')

  // And on a row: `s` does not start the task, but the widget keys still work, because a treeview
  // with no arrow keys and one tab stop would be unreachable.
  await handle(page, 'r0').focus()
  await page.keyboard.press('s')
  await expect(row(page, 'r0').getByRole('img', { name: 'In progress' })).toHaveCount(0)
  await page.keyboard.press('ArrowDown')
  await expect(handle(page, 'r1')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')

  // Survives a reload: it is stored, not just held in React state.
  await page.reload()
  await expect(page.getByRole('listitem')).toHaveCount(3)
  await page.keyboard.press('?')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0)

  // And it can be turned back on again through the same button.
  await page.getByRole('button', { name: 'Keys', exact: true }).click()
  await page.getByRole('switch', { name: /Single-key shortcuts/ }).check()
  await page.keyboard.press('Escape')
  await page.keyboard.press('c')
  await expect(captureBox(page)).toBeFocused()
})

test('the key after G or N is the prefix’s alone, whether or not it names one', async ({
  page,
}) => {
  await registerFreshUser(page)

  // `c` alone opens Capture; after `g` it is the jump to Calendar, only that.
  await page.keyboard.press('g')
  await page.keyboard.press('c')
  await expect(page).toHaveURL(/\/calendar$/)
  await expect(captureBox(page)).toHaveCount(0)
  // `?` alone is the key list; after `g` it names no jump, and does nothing.
  await page.keyboard.press('g')
  await page.keyboard.press('?')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0)
  await expect(page).toHaveURL(/\/calendar$/)
  // `N` then `T` makes a task from anywhere: the New task dialog, into the inbox.
  await page.keyboard.press('n')
  await page.keyboard.press('t')
  await expect(page.getByRole('dialog', { name: /New task/ })).toBeVisible()
  await page.keyboard.press('Escape')
  // And `c` alone still captures.
  await page.keyboard.press('c')
  await expect(captureBox(page)).toBeFocused()
})
