import { expect, test, type Page } from '@playwright/test'
import { openProject, registerFreshUser, submitCreate } from './helpers'

const MOVE_URL = /\/tasks\/[^/]+\/move$/

const handle = (page: Page, title: string) =>
  page.getByRole('button', { name: `任务：${title}`, exact: true })

const row = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title })

/** Records every move request the page sends, so a test can assert that none was. */
function recordMoves(page: Page) {
  const moves: string[] = []
  page.on('request', (r) => {
    if (MOVE_URL.test(r.url())) moves.push(r.url())
  })
  return moves
}

/** Is focus on a row of the task tree? */
const inTree = (page: Page) =>
  page.evaluate(() => !!document.activeElement?.closest('[data-task-tree]'))

/** How many of the tree's rows are in the tab order. A roving tabindex means exactly one. */
const tabStops = (page: Page) =>
  page.evaluate(
    () =>
      document.querySelectorAll('[data-task-tree] [data-handle-id]:not([tabindex="-1"])').length,
  )

const focusedTitle = (page: Page) =>
  page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null)

async function startProject(page: Page, name: string) {
  await page.getByRole('link', { name: '项目' }).click()
  await submitCreate(page, '新项目', name)
  await openProject(page, name, true)
  return page.url()
}

async function seed(page: Page, url: string, spec: [title: string, parent: string | null][]) {
  const projectId = url.split('/').pop()!
  const ids = new Map<string, string>()
  for (const [title, parent] of spec) {
    const res = await page.request.post('/api/v1/tasks', {
      headers: { 'x-ctws-client': 'web' },
      data: { projectId, title, parentId: parent ? ids.get(parent)! : null },
    })
    expect(res.ok()).toBeTruthy()
    ids.set(title, ((await res.json()) as { id: string }).id)
  }
  await page.goto(url)
  await expect(page.getByRole('listitem')).toHaveCount(spec.length)
  return ids
}

const flat = (n: number): [string, null][] =>
  Array.from({ length: n }, (_, i) => [`r${i}`, null] as [string, null])

/**
 * D51. The tree used to be one tab stop PER ROW, so getting past it cost one Tab per visible row.
 * A two-row tree would pass this under the old behaviour too, which is why it runs on twelve rows
 * and asserts the press count, not merely that Tab eventually gets out.
 */
test('the whole tree is one tab stop, however many rows it has', async ({ page }) => {
  await registerFreshUser(page)
  const url = await startProject(page, 'Many')
  await seed(page, url, flat(12))
  const moves = recordMoves(page)

  expect(await tabStops(page)).toBe(1)

  // From the control above the tree, one Tab enters it and one more leaves it: two presses with
  // twelve rows, where the old behaviour needed twelve.
  await page.getByPlaceholder('新任务').focus()
  await page.keyboard.press('Tab')
  expect(await inTree(page)).toBe(true)
  await page.keyboard.press('Tab')
  expect(await inTree(page)).toBe(false)

  // Shift+Tab is symmetric: back in, and back out to the box above.
  await page.keyboard.press('Shift+Tab')
  expect(await inTree(page)).toBe(true)
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByPlaceholder('新任务')).toBeFocused()

  // Tab is still bound to nothing: it reorganised nothing on the way through.
  expect(moves).toEqual([])
  await expect(page.getByRole('listitem')).toHaveText(flat(12).map(([t]) => new RegExp(t)))
})

test('the tab stop follows the row last used, so Tab re-enters where you left off', async ({
  page,
}) => {
  await registerFreshUser(page)
  const url = await startProject(page, 'Rove')
  await seed(page, url, flat(5))

  await handle(page, 'r3').focus()
  expect(await tabStops(page)).toBe(1)
  await page.getByPlaceholder('新任务').focus()
  await page.keyboard.press('Tab')
  // Not r0: a roving tabindex that always snapped back to the first row would make Tab a way of
  // losing your place.
  await expect(handle(page, 'r3')).toBeFocused()
})

test('arrows and j/k move between rows and stop at the ends', async ({ page }) => {
  await registerFreshUser(page)
  const url = await startProject(page, 'Move')
  await seed(page, url, flat(4))
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
  await seed(page, url, [
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
  await seed(page, url, flat(3))
  const projectId = url.split('/').pop()!

  const moved = page.waitForResponse((r) => MOVE_URL.test(r.url()) && r.ok())
  await handle(page, 'r2').focus()
  await page.keyboard.press('Alt+ArrowUp')
  await expect(page.getByRole('listitem')).toHaveText([/r0/, /r2/, /r1/])
  await moved

  const indented = page.waitForResponse((r) => MOVE_URL.test(r.url()) && r.ok())
  await page.keyboard.press('Alt+ArrowRight')
  await indented
  await expect(row(page, 'r2')).toHaveAttribute('data-depth', '2')

  // Read the server back rather than trusting the optimistic repaint.
  const body = await (await page.request.get(`/api/v1/projects/${projectId}/tasks`)).json()
  const tasks = body.tasks as { id: string; title: string; parentId: string | null }[]
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
  await expect(page.getByLabel('添加任务')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(handle(page, 'r1')).toBeFocused()
  await page.keyboard.press('Alt+Enter')
  await expect(page.getByLabel('添加任务')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(handle(page, 'r1')).toBeFocused()

  // `s` still starts the task.
  await page.keyboard.press('s')
  await expect(row(page, 'r1').getByRole('img', { name: '进行中' })).toBeVisible()
})

test('the ? overlay lists the keys, closes on Escape and on a click outside', async ({ page }) => {
  await registerFreshUser(page)

  await page.keyboard.press('?')
  const dialog = page.getByRole('dialog', { name: '键盘快捷键' })
  await expect(dialog).toBeVisible()
  // The keys it must actually name, not merely "a dialog appeared".
  for (const key of ['/', 'f', '?', 'g t', 'Alt+Enter', 'Shift+Enter', 's', 'x']) {
    // `.first()`: `s` and `x` are listed twice, once for the tree and once for the today page.
    await expect(dialog.getByText(key, { exact: true }).first()).toBeVisible()
  }

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  await page.keyboard.press('?')
  await expect(dialog).toBeVisible()
  // Outside the panel: the backdrop, at the very top of the viewport.
  await page.mouse.click(5, 5)
  await expect(dialog).toHaveCount(0)

  // Typed into a field it is a question mark, not a shortcut.
  await page.getByLabel('捕获').fill('')
  await page.getByLabel('捕获').press('?')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByLabel('捕获')).toHaveValue('?')
})

test('g chords jump between the four destinations and not while typing', async ({ page }) => {
  await registerFreshUser(page)
  const inbox = await page.request.get('/api/v1/projects')
  const { projects } = (await inbox.json()) as { projects: { id: string; name: string }[] }
  const inboxId = projects.find((p) => p.name === 'Inbox')!.id

  await page.keyboard.press('g')
  await page.keyboard.press('p')
  await expect(page).toHaveURL(/\/projects$/)

  await page.keyboard.press('g')
  await page.keyboard.press('d')
  await expect(page).toHaveURL(/\/tasks\/completed$/)

  await page.keyboard.press('g')
  await page.keyboard.press('i')
  await expect(page).toHaveURL(`/projects/${inboxId}`)

  await page.keyboard.press('g')
  await page.keyboard.press('t')
  await expect(page).toHaveURL(/\/tasks\/today$/)

  // In a text field, `g` then `p` is two letters of a word.
  await page.getByLabel('捕获').fill('')
  await page.getByLabel('捕获').press('g')
  await page.getByLabel('捕获').press('p')
  await expect(page).toHaveURL(/\/tasks\/today$/)
  await expect(page.getByLabel('捕获')).toHaveValue('gp')
})

test('the single-key shortcuts can be turned off, and stay off after a reload', async ({
  page,
}) => {
  await registerFreshUser(page)
  const url = await startProject(page, 'Off')
  await seed(page, url, flat(3))

  // The switch lives in the overlay, which also has a button: with the keys off, `?` must not be
  // the only way back to the setting that turned them off.
  await page.getByRole('button', { name: '键盘快捷键' }).click()
  const toggle = page.getByRole('checkbox', { name: /启用单键快捷键/ })
  await expect(toggle).toBeChecked()
  await toggle.uncheck()
  await page.keyboard.press('Escape')

  await page.keyboard.press('f')
  await expect(page.getByRole('textbox', { name: '搜索任务' })).toHaveCount(0)
  await page.keyboard.press('?')
  await expect(page.getByRole('dialog', { name: '键盘快捷键' })).toHaveCount(0)
  await page.keyboard.press('g')
  await page.keyboard.press('p')
  await expect(page).toHaveURL(new RegExp(`/projects/${url.split('/').pop()!}`))

  await page.getByRole('heading', { name: 'Off' }).click()
  await page.keyboard.press('/')
  await expect(page.getByLabel('捕获')).not.toBeFocused()

  // And on a row: `s` no longer starts the task, but the widget keys still work, because a
  // treeview with no arrow keys and one tab stop would be unreachable.
  await handle(page, 'r0').focus()
  await page.keyboard.press('s')
  await expect(row(page, 'r0').getByRole('img', { name: '进行中' })).toHaveCount(0)
  await page.keyboard.press('ArrowDown')
  await expect(handle(page, 'r1')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')

  // Survives a reload: it is stored, not just held in React state.
  await page.reload()
  await expect(page.getByRole('listitem')).toHaveCount(3)
  await page.keyboard.press('f')
  await expect(page.getByRole('textbox', { name: '搜索任务' })).toHaveCount(0)

  // And it can be turned back on again through the same button.
  await page.getByRole('button', { name: '键盘快捷键' }).click()
  await page.getByRole('checkbox', { name: /启用单键快捷键/ }).check()
  await page.keyboard.press('Escape')
  await page.keyboard.press('f')
  await expect(page.getByRole('textbox', { name: '搜索任务' })).toBeFocused()
})
