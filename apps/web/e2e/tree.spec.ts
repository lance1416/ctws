import { expect, test, type Page } from '@playwright/test'
import {
  MOVE_URL,
  openProject,
  recordMoves,
  registerFreshUser,
  seedTasks,
  serverParents,
  startProject,
  submitCreate,
} from './helpers'

type RouteUrl = Parameters<Page['route']>[0]

/**
 * A project's task list. The task module answers it at `GET /api/v1/tasks?projectId=<id>` (the
 * project belongs to the shell, so it is a filter rather than a path segment), and a URL glob
 * cannot express a query parameter -- hence a predicate.
 */
const TASK_LIST: RouteUrl = (url) =>
  url.pathname === '/api/v1/tasks' && url.searchParams.has('projectId')

/** The row's drag handle and keyboard focus carrier; its accessible name is the task title. */
const handle = (page: Page, title: string) =>
  page.getByRole('button', { name: `Task: ${title}`, exact: true })

/** Resolves when a move request has been answered successfully, i.e. it is persisted. */
function movePersisted(page: Page) {
  return page.waitForResponse((r) => MOVE_URL.test(r.url()) && r.ok())
}

/** Adds a root task through the new-task box and waits until it shows. */
async function addTask(page: Page, title: string) {
  await submitCreate(page, 'New task', title)
  await expect(page.getByPlaceholder('New task')).toHaveValue('')
  await expect(page.getByRole('listitem').filter({ hasText: title })).toBeVisible()
}

/** Creates a project with three root tasks and returns its url. */
async function seedProject(page: Page) {
  const url = await startProject(page)
  for (const title of ['one', 'two', 'three']) await addTask(page, title)
  await expect(page.getByRole('listitem')).toHaveCount(3)
  return url
}

/** Drags one handle onto another with real pointer events. */
async function dragOnto(page: Page, from: string, to: string) {
  // Both ends have to be ON SCREEN before the boxes are read: the pointer cannot be moved to a
  // coordinate outside the viewport, and since the workbench a row is 44px, so a dozen of them no
  // longer fit under the header at the default height.
  await handle(page, to).scrollIntoViewIfNeeded()
  await handle(page, from).scrollIntoViewIfNeeded()
  const a = await handle(page, from).boundingBox()
  const b = await handle(page, to).boundingBox()
  await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2)
  await page.mouse.down()
  // dnd-kit needs a few intermediate moves before it treats this as a drag.
  await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2, { steps: 10 })
  await page.mouse.up()
}

const depthOf = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title })

test('a reorder survives a reload', async ({ page }) => {
  await registerFreshUser(page)
  const url = await seedProject(page)

  const rows = page.getByRole('listitem')
  await expect(rows).toHaveText([/one/, /two/, /three/])

  // Keyboard reorder: the same drop.ts path the pointer drag uses, and deterministic in a test.
  await handle(page, 'three').focus()
  const persisted = movePersisted(page)
  await page.keyboard.press('Alt+ArrowUp')
  await expect(rows).toHaveText([/one/, /three/, /two/])
  await persisted

  await page.goto(url)
  await expect(page.getByRole('listitem')).toHaveText([/one/, /three/, /two/])
})

test('indenting makes a task the child of the row above and survives a reload', async ({
  page,
}) => {
  await registerFreshUser(page)
  const url = await seedProject(page)

  await handle(page, 'two').focus()
  const persisted = movePersisted(page)
  await page.keyboard.press('Alt+ArrowRight')
  await persisted

  await page.goto(url)
  await expect(depthOf(page, 'two')).toHaveAttribute('data-depth', '2')
  // The parent, not just the depth: a move under `three` would also be depth 2.
  expect(await serverParents(page, url)).toEqual({ one: null, two: 'one', three: null })
})

test('outdenting makes a child a sibling of its parent', async ({ page }) => {
  await registerFreshUser(page)
  const url = await startProject(page)
  await seedTasks(page, url, [
    ['one', null],
    ['two', 'one'],
    ['three', null],
  ])

  await handle(page, 'two').focus()
  const persisted = movePersisted(page)
  await page.keyboard.press('Alt+ArrowLeft')
  await persisted

  await expect(depthOf(page, 'two')).toHaveAttribute('data-depth', '1')
  expect(await serverParents(page, url)).toEqual({ one: null, two: null, three: null })
  await expect(page.getByRole('listitem')).toHaveText([/one/, /two/, /three/])
})

test('Tab leaves the tree instead of being captured by it', async ({ page }) => {
  await registerFreshUser(page)
  await seedProject(page)
  const moves = recordMoves(page)

  await handle(page, 'one').focus()
  await page.keyboard.press('Tab')
  // Focus moved on and nothing was reorganised. It used to land on the NEXT ROW, because every
  // row was its own tab stop; with the roving tabindex the tree is one stop, so Tab leaves
  // the tree altogether. Tab is still bound to nothing either way -- that is what this pins.
  await expect(handle(page, 'one')).not.toBeFocused()
  await expect(handle(page, 'two')).not.toBeFocused()
  expect(await page.evaluate(() => !!document.activeElement?.closest('[data-task-tree]'))).toBe(
    false,
  )
  await expect(page.getByRole('listitem')).toHaveText([/one/, /two/, /three/])
  expect(moves).toEqual([])
})

// Review Focus 5. A 409 must roll the optimistic update back, and the optimistic update must
// have happened in the first place. Both halves are pinned here by holding the requests open:
//  - the move request is held, so the transient (optimistic) order is observable;
//  - the task-list refetch is held, because it would repaint the true order whether or not the
//    rollback ran, and this test would pass without the rollback.
test('a move shows at once, and a rejected one rolls back visibly', async ({ page }) => {
  await registerFreshUser(page)
  const url = await seedProject(page)
  const rows = page.getByRole('listitem')

  let releaseList!: () => void
  const listGate = new Promise<void>((resolve) => (releaseList = resolve))
  await page.route(TASK_LIST, async (route) => {
    await listGate
    await route.continue()
  })

  let releaseMove!: () => void
  const moveGate = new Promise<void>((resolve) => (releaseMove = resolve))
  await page.route('**/api/v1/tasks/*/move', async (route) => {
    await moveGate
    await route.fulfill({
      status: 409,
      contentType: 'application/problem+json',
      body: JSON.stringify({ type: 'about:blank', title: 'Conflict', status: 409 }),
    })
  })

  await handle(page, 'three').focus()
  await page.keyboard.press('Alt+ArrowUp')

  // The server has not answered, yet the row has moved: this is the optimistic update.
  await expect(rows).toHaveText([/one/, /three/, /two/])
  await expect(page.getByRole('alert')).toHaveCount(0)

  releaseMove()
  // The failure is visible rather than silent. Asserted before the order: once the alert shows,
  // the move has failed and the rollback has had its chance to run.
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(rows).toHaveText([/one/, /two/, /three/])

  await page.unroute('**/api/v1/tasks/*/move')
  releaseList()
  await page.goto(url)
  await expect(page.getByRole('listitem')).toHaveText([/one/, /two/, /three/])
})

test('a captured task shows up in the inbox tree', async ({ page }) => {
  await registerFreshUser(page)
  await submitCreate(page, 'Capture…', '买咩6')
  await page.getByRole('link', { name: 'Projects' }).click()
  await openProject(page, 'Inbox')
  await expect(page.getByRole('listitem').filter({ hasText: '买咩6' })).toBeVisible()
})

test('a pointer drag up reorders the tree', async ({ page }) => {
  await registerFreshUser(page)
  const url = await seedProject(page)
  const rows = page.getByRole('listitem')

  const persisted = movePersisted(page)
  await dragOnto(page, 'three', 'one')

  await expect(rows).toHaveText([/three/, /one/, /two/])
  await persisted
  // Persisted, not just optimistic: the order must survive a reload.
  await page.goto(url)
  await expect(page.getByRole('listitem')).toHaveText([/three/, /one/, /two/])
})

// Dragging down must land after the target's whole visible block. With a childless target the
// slot is the same either way, so the target here has a child: landing between the target and
// its child would make the dragged row that child's sibling instead.
test('a pointer drag down lands after the whole block it is dropped on', async ({ page }) => {
  await registerFreshUser(page)
  const url = await startProject(page)
  await seedTasks(page, url, [
    ['aa', null],
    ['bb', null],
    ['bkid', 'bb'],
  ])
  const rows = page.getByRole('listitem')

  const persisted = movePersisted(page)
  await dragOnto(page, 'aa', 'bb')

  await expect(rows).toHaveText([/bb/, /bkid/, /aa/])
  await persisted
  await expect(depthOf(page, 'aa')).toHaveAttribute('data-depth', '1')
  await expect(depthOf(page, 'bkid')).toHaveAttribute('data-depth', '2')
  await page.goto(url)
  await expect(rows).toHaveText([/bb/, /bkid/, /aa/])
  expect(await serverParents(page, url)).toEqual({ aa: null, bb: null, bkid: 'bb' })
})

// Dropping a row inside its own subtree is refused before any request is made.
test('dragging a parent onto its own child is refused and sends no move', async ({ page }) => {
  await registerFreshUser(page)
  const url = await startProject(page)
  await seedTasks(page, url, [
    ['pp', null],
    ['c1', 'pp'],
    ['c2', 'pp'],
  ])
  const moves = recordMoves(page)

  await dragOnto(page, 'pp', 'c1')

  await expect(page.getByRole('alert')).toHaveText('A task cannot move inside itself')
  // Absence is only meaningful after giving a wrongly-sent request time to leave the page.
  await page.waitForTimeout(500)
  expect(moves).toEqual([])
  await expect(page.getByRole('listitem')).toHaveText([/pp/, /c1/, /c2/])
})

// Moving past an expanded subtree must step over all of it. Landing between the subtree's root
// and its first child would silently make the moved row that subtree's child.
test('Alt+Down moves a row with children past the whole next block', async ({ page }) => {
  await registerFreshUser(page)
  const url = await startProject(page)
  await seedTasks(page, url, [
    ['mm', null],
    ['mkid', 'mm'],
    ['qq', null],
    ['qkid', 'qq'],
  ])
  const rows = page.getByRole('listitem')

  await handle(page, 'mm').focus()
  const persisted = movePersisted(page)
  await page.keyboard.press('Alt+ArrowDown')
  await persisted

  await expect(rows).toHaveText([/qq/, /qkid/, /mm/, /mkid/])
  await expect(depthOf(page, 'mm')).toHaveAttribute('data-depth', '1')
  await expect(depthOf(page, 'mkid')).toHaveAttribute('data-depth', '2')
  expect(await serverParents(page, url)).toEqual({ mm: null, mkid: 'mm', qq: null, qkid: 'qq' })
})

test('Alt+Up past an expanded parent keeps the row at its own depth', async ({ page }) => {
  await registerFreshUser(page)
  const url = await startProject(page)
  await seedTasks(page, url, [
    ['pa', null],
    ['qa', null],
    ['kid', 'qa'],
    ['ra', null],
  ])
  const rows = page.getByRole('listitem')

  await handle(page, 'ra').focus()
  const persisted = movePersisted(page)
  await page.keyboard.press('Alt+ArrowUp')
  await persisted
  await expect(rows).toHaveText([/pa/, /ra/, /qa/, /kid/])
  await expect(depthOf(page, 'ra')).toHaveAttribute('data-depth', '1')
  await expect(depthOf(page, 'kid')).toHaveAttribute('data-depth', '2')
})

// A collapsed row hides its descendants, so its visible block is shorter than its real one. The
// move must step over the visible block only, and the hidden children must stay with their parent.
test('Alt+Down past a collapsed sibling lands after it', async ({ page }) => {
  await registerFreshUser(page)
  const url = await startProject(page)
  await seedTasks(page, url, [
    ['aa', null],
    ['bb', null],
    ['bkid', 'bb'],
    ['cc', null],
  ])
  const rows = page.getByRole('listitem')
  await page.getByRole('button', { name: 'Collapse' }).click()
  await expect(rows).toHaveText([/aa/, /bb/, /cc/])

  await handle(page, 'aa').focus()
  const persisted = movePersisted(page)
  await page.keyboard.press('Alt+ArrowDown')
  await persisted
  await expect(rows).toHaveText([/bb/, /aa/, /cc/])

  await page.getByRole('button', { name: 'Expand' }).click()
  await expect(rows).toHaveText([/bb/, /bkid/, /aa/, /cc/])
  expect(await serverParents(page, url)).toEqual({ aa: null, bb: null, bkid: 'bb', cc: null })
})

// Indenting under a folded row is legal, but the row would then sit inside the fold and vanish
// from the screen while staying in the database. The fold must open so the result is visible.
test('Alt+Right under a collapsed row opens it and keeps the moved row visible', async ({
  page,
}) => {
  await registerFreshUser(page)
  const url = await startProject(page)
  await seedTasks(page, url, [
    ['aa', null],
    ['akid', 'aa'],
    ['bb', null],
  ])
  const rows = page.getByRole('listitem')
  await page.getByRole('button', { name: 'Collapse' }).click()
  await expect(rows).toHaveText([/aa/, /bb/])

  await handle(page, 'bb').focus()
  const persisted = movePersisted(page)
  await page.keyboard.press('Alt+ArrowRight')
  await persisted

  await expect(rows).toHaveText([/aa/, /akid/, /bb/])
  await expect(depthOf(page, 'bb')).toHaveAttribute('data-depth', '2')
  expect(await serverParents(page, url)).toEqual({ aa: null, akid: 'aa', bb: 'aa' })
  // The opened state is persisted, so a reload agrees with what was on screen.
  await page.reload()
  await expect(rows).toHaveText([/aa/, /akid/, /bb/])
})

test('dragging a row right under a collapsed row opens it and keeps the row visible', async ({
  page,
}) => {
  await registerFreshUser(page)
  const url = await startProject(page)
  await seedTasks(page, url, [
    ['aa', null],
    ['akid', 'aa'],
    ['bb', null],
  ])
  const rows = page.getByRole('listitem')
  await page.getByRole('button', { name: 'Collapse' }).click()
  await expect(rows).toHaveText([/aa/, /bb/])

  const box = await handle(page, 'bb').boundingBox()
  const persisted = movePersisted(page)
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  // One indent step to the right, no vertical travel.
  await page.mouse.move(box!.x + box!.width / 2 + 25, box!.y + box!.height / 2, { steps: 10 })
  await page.mouse.up()
  await persisted

  await expect(rows).toHaveText([/aa/, /akid/, /bb/])
  await expect(depthOf(page, 'bb')).toHaveAttribute('data-depth', '2')
  expect(await serverParents(page, url)).toEqual({ aa: null, akid: 'aa', bb: 'aa' })
})

test('Alt+Up on the first row and Alt+Down on the last row do nothing', async ({ page }) => {
  await registerFreshUser(page)
  await seedProject(page)
  const rows = page.getByRole('listitem')
  const moves = recordMoves(page)

  await handle(page, 'one').focus()
  await page.keyboard.press('Alt+ArrowUp')
  await handle(page, 'three').focus()
  await page.keyboard.press('Alt+ArrowDown')

  await page.waitForTimeout(500)
  expect(moves).toEqual([])
  await expect(rows).toHaveText([/one/, /two/, /three/])
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('collapsing hides the descendants and the fold survives a reload', async ({ page }) => {
  await registerFreshUser(page)
  const url = await startProject(page)
  await seedTasks(page, url, [
    ['pa', null],
    ['kid', 'pa'],
  ])
  const rows = page.getByRole('listitem')
  await expect(rows).toHaveCount(2)

  await page.getByRole('button', { name: 'Collapse' }).click()
  await expect(rows).toHaveCount(1)

  await page.goto(url)
  await expect(rows.filter({ hasText: 'pa' })).toBeVisible()
  await expect(rows).toHaveCount(1)

  await page.getByRole('button', { name: 'Expand' }).click()
  await expect(rows).toHaveCount(2)
  await expect(rows.filter({ hasText: 'kid' })).toBeVisible()
})

test('a stale collapsed id on a leaf draws no chevron', async ({ page }) => {
  await registerFreshUser(page)
  const url = await startProject(page)
  await addTask(page, 'leaf')
  const projectId = url.split('/').pop()!
  const tasks = await (await page.request.get(`/api/v1/projects/${projectId}/tasks`)).json()
  const leafId = tasks.tasks[0].id as string
  await page.evaluate(
    ([k, v]) => localStorage.setItem(k!, v!),
    [`ctws.collapsed.${projectId}`, JSON.stringify([leafId])],
  )

  await page.goto(url)
  await expect(page.getByRole('listitem').filter({ hasText: 'leaf' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Expand|Collapse/ })).toHaveCount(0)
})

// Not reachable from the keyboard (Alt+arrows can only produce clamped, legal depths), so this
// uses the pointer: a 2-high subtree dragged in front of a row at MAX_DEPTH has nowhere legal to go.
test('a too-deep drop shows a message and sends no move', async ({ page }) => {
  await registerFreshUser(page)
  const url = await startProject(page)
  const chain: [string, string | null][] = []
  for (let i = 1; i <= 10; i++) chain.push([`chain${i}`, i === 1 ? null : `chain${i - 1}`])
  await seedTasks(page, url, [...chain, ['xx', null], ['xkid', 'xx']])
  const moves = recordMoves(page)

  await dragOnto(page, 'xx', 'chain10')

  await expect(page.getByRole('alert')).toHaveText('Too deep to move it there')
  // Absence is only meaningful after giving a wrongly-sent request time to leave the page.
  await page.waitForTimeout(500)
  expect(moves).toEqual([])
})

/**
 * Holds the FIRST task-list GET of a project: the server's answer is captured immediately (so it
 * reflects the state before any create) but delivered to the page only when `release` is called.
 * Later GETs pass straight through. A fixed delay cannot do this: it would let the server see the
 * create, which makes the held response fresh and hides the bug.
 */
async function holdFirstListFetch(page: Page, glob: RouteUrl = TASK_LIST) {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  let captured!: () => void
  const heldStale = new Promise<void>((resolve) => (captured = resolve))
  let first = true
  await page.route(glob, async (route) => {
    if (route.request().method() !== 'GET' || !first) return route.continue()
    first = false
    const stale = await route.fetch()
    captured()
    await gate
    await route.fulfill({ response: stale })
  })
  return { release, heldStale }
}

// A task created while the project's first list fetch is still in flight must still appear: the
// refetch after the create has to start a NEW request rather than be absorbed by the stale one.
test('a task created while the project is still loading appears', async ({ page }) => {
  await registerFreshUser(page)
  await page.getByRole('link', { name: 'Projects' }).click()
  await submitCreate(page, 'New project', 'P')

  const { release, heldStale } = await holdFirstListFetch(page)
  // Scoped to <main>: the left rail lists every project by name too, so an unscoped
  // project-name locator now matches twice. The centre column is the list under test.
  await page.getByRole('main').getByText('P', { exact: true }).click()
  await heldStale
  await submitCreate(page, 'New task', 'typed early')
  release()

  await expect(page.getByRole('listitem').filter({ hasText: 'typed early' })).toBeVisible()
})

test('a capture made while the inbox is still loading appears', async ({ page }) => {
  await registerFreshUser(page)
  await page.getByRole('link', { name: 'Projects' }).click()
  await expect(page.getByRole('main').getByText('Inbox')).toBeVisible()

  const { release, heldStale } = await holdFirstListFetch(page)
  await page.getByRole('main').getByText('Inbox').click()
  await heldStale
  await submitCreate(page, 'Capture…', 'captured early')
  release()

  await expect(page.getByRole('listitem').filter({ hasText: 'captured early' })).toBeVisible()
})

// The projects list has the same first-load hole as the task list: a project created while the
// very first GET /projects is still in flight must still appear.
test('a project created while the project list is still loading appears', async ({ page }) => {
  await registerFreshUser(page)
  const { release, heldStale } = await holdFirstListFetch(page, '**/api/v1/projects')
  await page.goto('/projects')
  await heldStale
  await submitCreate(page, 'New project', 'typed early')
  release()

  await expect(page.getByRole('main').getByRole('link', { name: 'typed early' })).toBeVisible()
})

test('a refused move puts the fold it opened back', async ({ page }) => {
  await registerFreshUser(page)
  const url = await startProject(page)
  await seedTasks(page, url, [
    ['aa', null],
    ['akid', 'aa'],
    ['bb', null],
  ])
  const rows = page.getByRole('listitem')
  await page.getByRole('button', { name: 'Collapse' }).click()
  await expect(rows).toHaveText([/aa/, /bb/])

  // The drop unfolds `aa` so the moved row lands somewhere visible. The server then refuses it.
  await page.route('**/api/v1/tasks/*/move', (r) => r.fulfill({ status: 500, body: '{}' }))
  const box = (await handle(page, 'bb').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 25, box.y + box.height / 2, { steps: 10 })
  await page.mouse.up()
  await expect(page.getByRole('alert')).toBeVisible()

  // Nothing landed there, so nothing should have been opened: the tree is exactly as it was.
  // It used to stay open -- the one visible trace of an action that did not happen.
  await expect(rows).toHaveText([/aa/, /bb/])
  await page.unroute('**/api/v1/tasks/*/move')
  // And the fold is remembered that way, not just drawn that way.
  await page.reload()
  await expect(rows).toHaveText([/aa/, /bb/])
})
