import { expect, test, type Page } from '@playwright/test'
import {
  editDetail,
  makeProject,
  makeTask,
  openTree,
  registerFreshUser,
  serverTask,
  serverTasks,
  taskPatched,
  WEB,
} from './helpers'
import { DAY, dayOffset, dueAgo, MONTHS, ymd } from './days'

// The daily loop: finishing, starting and deferring work from the list itself, the dates a tree
// row shows, and the panel / delete guards. Every assertion that a status or date changed reads
// the SERVER (a fresh GET), not the screen: an optimistic update that never reached the API
// would pass any check that only looks at the UI.

const treeRow = (page: Page, title: string) =>
  page
    .locator('li[data-depth]')
    .filter({ has: page.getByRole('button', { name: `Task: ${title}`, exact: true }) })

// ----------------------------------------------------------------------------------------- status

test('the status mark in a tree row finishes the task in one click, and it is saved', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案')
  await openTree(page, pid)

  const requests: string[] = []
  page.on('request', (r) => {
    if (r.method() !== 'GET') requests.push(`${r.method()} ${new URL(r.url()).pathname}`)
  })
  const done = taskPatched(page)
  await page.getByRole('button', { name: 'Complete “写方案”' }).click()
  const res = await done
  // One request, carrying exactly the status: nothing else rewritten.
  expect(res.request().postDataJSON()).toEqual({ status: 'done' })
  expect(requests).toHaveLength(1)
  // One action: the detail panel never opened.
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // It stayed on screen: a row finished HERE is not swept up by the hiding, so the mark can
  // show it worked and a mis-press can be undone from the same row.
  await expect(treeRow(page, '写方案').getByRole('img', { name: 'Done' })).toBeVisible()

  // The server has it. A fresh load is where the hiding applies: the tree is what is left to do,
  // and this is now part of the finished pile, reachable behind its own count.
  expect((await serverTask(page, pid, '写方案')).status).toBe('done')
  await page.reload()
  await expect(treeRow(page, '写方案')).toHaveCount(0)
  await page.getByRole('button', { name: '1 done' }).click()
  await expect(treeRow(page, '写方案').getByRole('img', { name: 'Done' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reopen “写方案”' })).toBeVisible()
})

test('a finished task reopens to where it was before: In progress, or To do', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案', { status: 'done' })
  const started = await makeTask(page, pid, '改稿', { status: 'in_progress' })
  const res = await page.request.patch(`/api/v1/tasks/${started}`, {
    headers: WEB,
    data: { status: 'done' },
  })
  expect(res.ok()).toBe(true)
  await openTree(page, pid)
  // They arrived already finished, so the tree starts without them; the count is the way in.
  await expect(treeRow(page, '写方案')).toHaveCount(0)
  await page.getByRole('button', { name: '2 done' }).click()

  // Its change log says it was under way when it was finished: it goes back to In progress.
  let restored = taskPatched(page)
  await page.getByRole('button', { name: 'Reopen “改稿”' }).click()
  expect((await restored).request().postDataJSON()).toEqual({ status: 'in_progress' })
  // Never started: To do, not the backlog it was made in.
  restored = taskPatched(page)
  await page.getByRole('button', { name: 'Reopen “写方案”' }).click()
  expect((await restored).request().postDataJSON()).toEqual({ status: 'todo' })
  expect((await serverTask(page, pid, '改稿')).status).toBe('in_progress')
  expect((await serverTask(page, pid, '写方案')).status).toBe('todo')
})

test('finished and reopened from the same row, a task is back where it was', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '改稿', { status: 'in_progress' })
  await openTree(page, pid)
  const finished = taskPatched(page)
  await page.getByRole('button', { name: 'Complete “改稿”' }).click()
  await finished
  await expect(treeRow(page, '改稿').getByRole('img', { name: 'Done' })).toBeVisible()
  const restored = taskPatched(page)
  await page.getByRole('button', { name: 'Reopen “改稿”' }).click()
  expect((await restored).request().postDataJSON()).toEqual({ status: 'in_progress' })
  await expect(treeRow(page, '改稿').getByRole('img', { name: 'In progress' })).toBeVisible()
})

test('starting a task from its row puts it under In progress, and S on Today pauses it', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案')
  await openTree(page, pid)

  // A dateless, not-started task is not on Today's lists, and an empty block is not drawn (FR-079).
  await page.getByRole('link', { name: 'Today' }).click()
  await expect(page.locator('#today-heading')).toBeVisible()
  await expect(page.locator('[data-today-row]').filter({ hasText: '写方案' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'In progress' })).toHaveCount(0)
  await page.goBack()
  await page.getByRole('listitem').first().waitFor()

  const started = taskPatched(page)
  await page.getByRole('button', { name: 'Start “写方案”' }).click()
  expect((await started).request().postDataJSON()).toEqual({ status: 'in_progress' })
  expect((await serverTask(page, pid, '写方案')).status).toBe('in_progress')

  await page.getByRole('link', { name: 'Today' }).click()
  const progress = page.getByRole('region', { name: 'In progress' })
  await expect(progress.getByText('写方案')).toBeVisible()

  // Paused from the row with S: it has no date, so it leaves the list.
  const stopped = taskPatched(page)
  await page.locator('[data-today-row]').filter({ hasText: '写方案' }).focus()
  await page.keyboard.press('s')
  expect((await stopped).request().postDataJSON()).toEqual({ status: 'todo' })
  await expect(progress).toHaveCount(0)
  expect((await serverTask(page, pid, '写方案')).status).toBe('todo')
})

test('x, then s, on a focused tree row change its status, each saved', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案')
  await openTree(page, pid)
  const handle = page.getByRole('button', { name: 'Task: 写方案', exact: true })

  await handle.focus()
  let res = taskPatched(page)
  await page.keyboard.press('x')
  expect((await res).request().postDataJSON()).toEqual({ status: 'done' })
  expect((await serverTask(page, pid, '写方案')).status).toBe('done')
  // Focus did not move: the keyboard user can keep going from the same row.
  await expect(handle).toBeFocused()

  res = taskPatched(page)
  await page.keyboard.press('x')
  // Reopened, it is what it was before; never started, that is To do (BUG-095).
  expect((await res).request().postDataJSON()).toEqual({ status: 'todo' })

  res = taskPatched(page)
  await page.keyboard.press('s')
  expect((await res).request().postDataJSON()).toEqual({ status: 'in_progress' })
  expect((await serverTask(page, pid, '写方案')).status).toBe('in_progress')

  // A modified key is somebody else's shortcut (Alt+arrows move rows, Ctrl+S saves the page).
  const sent: string[] = []
  page.on('request', (r) => r.method() === 'PATCH' && sent.push(r.url()))
  await page.keyboard.press('Control+s')
  await page.keyboard.press('Alt+x')
  // A plain key afterwards does send, so the one write proves the modified keys were handled.
  res = taskPatched(page)
  await page.keyboard.press('x')
  await res
  expect(sent).toHaveLength(1)
})

test('a Today row is finished by its mark, by x, and focus moves to the next row', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '甲', { status: 'in_progress' })
  await makeTask(page, pid, '乙', { status: 'in_progress' })
  await makeTask(page, pid, '丙', { status: 'in_progress' })
  await page.goto('/today')
  const region = page.getByRole('region', { name: 'In progress' })
  await expect(region.getByText('甲')).toBeVisible()
  const order = await page.locator('[data-today-row]').allInnerTexts()
  const firstTitle = order[0]!.split('\n')[0]!
  const secondTitle = order[1]!.split('\n')[0]!

  const first = taskPatched(page)
  await page.getByRole('button', { name: `Complete “${firstTitle}”` }).click()
  expect((await first).request().postDataJSON()).toEqual({ status: 'done' })
  await expect(region.getByText(firstTitle, { exact: true })).toHaveCount(0)
  // The clicked row is gone; focus must not have fallen to <body>.
  await expect(page.locator('[data-today-row]').filter({ hasText: secondTitle })).toBeFocused()
  expect((await serverTask(page, pid, firstTitle)).status).toBe('done')

  // Keyboard route on the focused row.
  const second = taskPatched(page)
  await page.keyboard.press('x')
  expect((await second).request().postDataJSON()).toEqual({ status: 'done' })
  await expect(region.getByText(secondTitle, { exact: true })).toHaveCount(0)
  expect((await serverTask(page, pid, secondTitle)).status).toBe('done')

  // Survives a reload: one row is left and it is the one nobody touched.
  await page.reload()
  await expect(page.locator('[data-today-row]')).toHaveCount(1)
})

// ---------------------------------------------------------------------------------- overdue exits

test('a late task given a day leaves Overdue, its deadline kept; moving the deadline does too', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const id = await makeTask(page, pid, '过期了', { dueAt: dueAgo(2) })
  const tomorrow = ymd(new Date(Date.now() + DAY))
  const segmentOf = async () => {
    const tasks = (await (await page.request.get('/api/v1/tasks?view=today')).json()).tasks as {
      id: string
      segment: string
    }[]
    return tasks.find((t) => t.id === id)?.segment ?? 'absent'
  }
  expect(await segmentOf()).toBe('overdue')

  // Given tomorrow, it waits for tomorrow (FR-079, Lance 2026-10-22): off Today, the deadline as
  // it was. The day-by-day of it is the pinned spec's ("交申请").
  const due = (await serverTask(page, pid, '过期了')).dueAt
  const p = await page.request.patch(`/api/v1/tasks/${id}`, {
    headers: WEB,
    data: { scheduledOn: tomorrow },
  })
  expect(p.status()).toBe(200)
  expect((await serverTask(page, pid, '过期了')).scheduledOn).toBe(tomorrow)
  expect((await serverTask(page, pid, '过期了')).dueAt).toBe(due)
  expect(await segmentOf()).toBe('absent')
  await page.goto('/today')
  await expect(page.getByRole('region', { name: 'Overdue' })).toHaveCount(0)

  // Unplanned again, it is overdue again; then moving the deadline itself takes it out.
  const back = await page.request.patch(`/api/v1/tasks/${id}`, {
    headers: WEB,
    data: { scheduledOn: null },
  })
  expect(back.status()).toBe(200)
  expect(await segmentOf()).toBe('overdue')
  const q = await page.request.patch(`/api/v1/tasks/${id}`, {
    headers: WEB,
    data: { dueAt: new Date(Date.now() + 3 * DAY).toISOString() },
  })
  expect(q.status()).toBe(200)
  expect(await segmentOf()).not.toBe('overdue')
})

test('an overdue row is finished with its mark, and only overdue rows have the days to move to', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '逾期的', { dueAt: dueAgo(2) })
  await makeTask(page, pid, '在做的', { status: 'in_progress' })
  await page.goto('/today')
  // The overdue row offers Today, Tomorrow, Mon and a day picked; the in-progress row none of it.
  await expect(page.getByRole('button', { name: /^Plan “逾期的” for/ })).toHaveCount(4)
  await expect(page.getByRole('button', { name: /^Plan “在做的”/ })).toHaveCount(0)

  const res = taskPatched(page)
  await page.getByRole('button', { name: 'Complete “逾期的”' }).click()
  expect((await res).request().postDataJSON()).toEqual({ status: 'done' })
  await expect(page.getByRole('region', { name: 'Overdue' })).toHaveCount(0)
  expect((await serverTask(page, pid, '逾期的')).status).toBe('done')
})

// ---------------------------------------------------------------------------------- dates in tree

test('the tree shows deadlines only where they mean something', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const now = new Date()
  const todayLate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 30)
  // Taken ONCE and reused below: deriving the expected wording from a second `dueAgo(5)` call
  // would read the clock twice, and a minute tick between the two makes the test red for a minute.
  const lateDue = dueAgo(5)
  await makeTask(page, pid, '逾期的', { dueAt: lateDue })
  await makeTask(page, pid, '今天截止', { dueAt: todayLate.toISOString() })
  await makeTask(page, pid, '只排期', { scheduledOn: ymd(new Date(now.getTime() + DAY)) })
  await makeTask(page, pid, '没日期')
  await openTree(page, pid)

  const due = (title: string) => treeRow(page, title).locator('[data-row-due]')
  const d = new Date(lateDue)
  // Missed: the day it was due, on red, flagged.
  await expect(due('逾期的')).toHaveAttribute('data-row-due', 'late')
  await expect(due('逾期的')).toContainText(`${MONTHS[d.getMonth()]} ${d.getDate()}`)
  // Due today at the end of the day is a day, not a minute before midnight.
  await expect(due('今天截止')).toHaveAttribute('data-row-due', 'soon')
  await expect(due('今天截止')).toContainText('Today')
  // A plan is the detail's to say, and a dateless row says nothing: the row is still a row.
  await expect(due('只排期')).toHaveCount(0)
  await expect(due('没日期')).toHaveCount(0)
})

// ----------------------------------------------------------------------------- destructive guards

test('deleting a project asks first, names what is lost, and cancel deletes nothing', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '待删项目')
  for (const t of ['一', '二', '三']) await makeTask(page, pid, t)
  // At the foot of the project's edit page, the only place it is offered from (FR-052).
  await page.goto(`/projects/${pid}/edit`)
  const deletes: string[] = []
  page.on('request', (r) => r.method() === 'DELETE' && deletes.push(r.url()))

  const del = page.getByRole('button', { name: /^Delete / })
  await del.click()
  const ask = page.getByRole('alertdialog', { name: 'Delete 待删项目' })
  // What goes, then what stays (FR-035).
  await expect(ask).toContainText('Delete 待删项目? Its 3 tasks go.')
  await expect(ask).toContainText('stay, outside any project')
  // The first click only asks.
  expect(deletes).toHaveLength(0)

  await ask.getByRole('button', { name: 'Cancel' }).click()
  await expect(ask).toHaveCount(0)
  expect(deletes).toHaveLength(0)
  const list = await (await page.request.get('/api/v1/projects')).json()
  expect(list.projects.map((p: { name: string }) => p.name)).toContain('待删项目')
  expect(await serverTasks(page, pid)).toHaveLength(3)
  // And focus is back on the control that asked, not lost to <body>.
  await expect(del).toBeFocused()

  // Escape is also "no".
  await del.click()
  await expect(ask).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(ask).toHaveCount(0)
  expect(deletes).toHaveLength(0)

  // Only the explicit confirmation deletes, and the server really lost it: the one DELETE sent
  // is this one, so neither Cancel nor Escape sent any.
  await del.click()
  await ask.getByRole('button', { name: 'Delete' }).click()
  // The page it was on cannot survive it, so it ends on the list.
  await expect(page).toHaveURL(/\/projects$/)
  expect(deletes).toHaveLength(1)
  const after = await (await page.request.get('/api/v1/projects')).json()
  expect(after.projects.map((p: { name: string }) => p.name)).not.toContain('待删项目')
})

// The detail panel is an OVERLAY only below 1280px; at or above that width it is a coexisting
// third column, where a scrim, a click-outside and a focus trap would all be wrong. These tests are
// about the overlay, so they run at a width where it is one. The column's own contract is pinned in
// project-page.spec.ts.
const OVERLAY_VIEWPORT = { width: 1024, height: 800 }

test.describe('the panel as an overlay', () => {
  test.use({ viewport: OVERLAY_VIEWPORT })

  test('a panel with unsaved edits closes and keeps them; Cancel asks, and discard drops them', async ({
    page,
  }) => {
    await registerFreshUser(page)
    const pid = await makeProject(page, 'P')
    await makeTask(page, pid, '写方案')
    await openTree(page, pid)
    await page.getByRole('listitem').filter({ hasText: '写方案' }).click()
    await editDetail(page)
    const dialog = page.getByRole('dialog')
    await page.getByLabel('Title').fill('写方案 v2')

    // Cancel is the one way out that lets it go, so it asks (FR-029).
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toContainText('Discard the changes?')
    await page.keyboard.press('Escape') // Escape on the question means keep editing
    await expect(dialog.getByText('Discard the changes?')).toHaveCount(0)
    await expect(page.getByLabel('Title')).toHaveValue('写方案 v2')

    // Escape steps out of editing without asking, and Edit brings back what was typed.
    await page.getByLabel('Title').press('Escape')
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
    await editDetail(page)
    await expect(page.getByLabel('Title')).toHaveValue('写方案 v2')

    // The ✕ and a click outside close the pane as Escape does, keeping it too.
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toHaveCount(0)
    await page.getByRole('listitem').filter({ hasText: '写方案' }).click()
    await editDetail(page)
    await expect(page.getByLabel('Title')).toHaveValue('写方案 v2')
    await page.mouse.click(60, 600)
    await expect(dialog).toHaveCount(0)
    await page.getByRole('listitem').filter({ hasText: '写方案' }).click()
    await editDetail(page)
    await expect(page.getByLabel('Title')).toHaveValue('写方案 v2')

    await page.getByRole('button', { name: 'Cancel' }).click()
    await page.getByRole('button', { name: 'Discard changes' }).click()
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    expect((await serverTask(page, pid, '写方案')).title).toBe('写方案')
    // A panel reopened afterwards is clean again.
    await page.getByRole('listitem').filter({ hasText: '写方案' }).click()
    await editDetail(page)
    await expect(page.getByLabel('Title')).toHaveValue('写方案')
    // ESCAPE UNWINDS ONE LEVEL AT A TIME: out of editing into reading, and only then out of the
    // pane. With nothing typed neither step asks.
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })

  /**
   * A NAMED DAY PRESSED IS AN UNSAVED EDIT. The date decisions (today, tomorrow, next week, and
   * the two ways out) do not type into a field, so the form has to be told they changed
   * something. Without that the form reads as clean and the person walks away from a press that
   * did nothing, with no prompt -- which is why this is its own case rather than a line in the
   * cases that only watch for a missing request.
   */
  test('a named date decision counts as an unsaved edit, with nothing typed', async ({ page }) => {
    await registerFreshUser(page)
    const pid = await makeProject(page, 'P')
    await makeTask(page, pid, '写方案')
    await openTree(page, pid)
    await page.getByRole('listitem').filter({ hasText: '写方案' }).click()
    await editDetail(page)
    const dialog = page.getByRole('dialog')

    // Not a keystroke in the panel: one press on the named day, which writes the deadline field.
    await page.getByRole('button', { name: 'Due tomorrow' }).click()
    await expect(page.getByLabel('Due', { exact: true })).not.toHaveValue('')
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toContainText('Discard the changes?')
    await page.getByRole('button', { name: 'Keep editing' }).click()

    // The plan half of the same control, and the ways OUT of a date are edits too: clearing the plan on a
    // task that has a plan removes it, so leaving would lose that.
    await page.getByRole('button', { name: 'Plan for today' }).click()
    await page.getByRole('button', { name: 'Clear the plan' }).click()
    // Back to what it was (no plan), so there is nothing to lose and nothing to ask about -- the
    // deadline press above is what still makes it dirty.
    await expect(page.getByLabel('Plan', { exact: true })).toHaveValue('')
    await page.getByRole('button', { name: 'Clear the deadline' }).click()
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toHaveCount(0)
    expect((await serverTask(page, pid, '写方案')).dueAt).toBeNull()
  })

  // ---------------------------------------------------------------------------------------- panel

  test('tab and shift+tab never leave the open panel', async ({ page }) => {
    await registerFreshUser(page)
    const pid = await makeProject(page, 'P')
    await makeTask(page, pid, '写方案')
    await openTree(page, pid)
    await page.getByRole('listitem').filter({ hasText: '写方案' }).click()
    await editDetail(page)
    // Focus is inside the panel to start with. (That it lands on the PANEL when the pane first
    // opens is pinned in detail.spec.ts; Edit hands it to the first field instead, which is
    // pinned in pane.spec.ts. What this test is about is that it never gets out.)
    await expect(page.getByRole('textbox', { name: 'Title' })).toBeFocused()

    const inside = () =>
      page.evaluate(() => {
        const a = document.activeElement
        return !!a && !!a.closest('[role="dialog"]')
      })
    const seen = new Set<string>()
    // Far more presses than the panel has controls, so a leak into the page would show.
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab')
      expect(await inside(), `after Tab ${i + 1}`).toBe(true)
      seen.add(
        await page.evaluate(
          () => document.activeElement!.textContent + document.activeElement!.tagName,
        ),
      )
    }
    // It really did walk the panel's controls (not stuck on one).
    expect(seen.size).toBeGreaterThan(5)
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Shift+Tab')
      expect(await inside(), `after Shift+Tab ${i + 1}`).toBe(true)
    }
  })

  test('a click outside closes the panel, a click inside does not', async ({ page }) => {
    await registerFreshUser(page)
    const pid = await makeProject(page, 'P')
    await makeTask(page, pid, '写方案')
    await openTree(page, pid)
    await page.getByRole('listitem').filter({ hasText: '写方案' }).click()
    await editDetail(page)
    const dialog = page.getByRole('dialog')

    await page.getByRole('textbox', { name: 'Notes', exact: true }).click()
    // A click on a non-interactive part of the panel. The panel prints no label over the title
    // (it opens with the task itself), so this presses the Notes label instead --
    // still a dead area of the panel, which is the whole point of the assertion.
    await dialog.getByText('Notes').click()
    await expect(dialog).toBeVisible()

    await page.mouse.click(60, 600)
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Task: 写方案', exact: true })).toBeFocused()
  })
})

test('the open panel leaves the chrome usable', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案')
  await openTree(page, pid)
  await page.getByRole('listitem').filter({ hasText: '写方案' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()

  // What is at the centre of each control is that control, not the panel: Capture and the
  // account menu, both in the bar the pane sits beside.
  for (const target of [
    page.getByRole('button', { name: /^Capture/ }),
    page.getByTestId('current-user'),
  ]) {
    const box = (await target.boundingBox())!
    const hit = await target.evaluate((el, p) => el.contains(document.elementFromPoint(p.x, p.y)), {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    })
    expect(hit).toBe(true)
  }
})

test('saving returns the panel to reading, says so on the row, and is on the server', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案')
  await openTree(page, pid)
  await page.getByRole('listitem').filter({ hasText: '写方案' }).click()
  await editDetail(page)
  await page.getByRole('textbox', { name: 'Notes', exact: true }).fill('先问清需求')

  const done = taskPatched(page)
  await page.getByRole('button', { name: 'Save' }).click()
  await done
  // THE PANE STAYS OPEN, in reading mode: what was just written is on screen to be read back,
  // which is what a person does immediately after writing it.
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveCount(0)
  await expect(page.getByText('先问清需求')).toBeVisible()
  await expect(treeRow(page, '写方案').getByRole('status')).toHaveText('Saved')
  // The confirmation is momentary, not a permanent badge.
  await expect(treeRow(page, '写方案').getByRole('status')).toHaveCount(0, { timeout: 6000 })
  const body = await serverTasks(page, pid)
  expect(body[0]!.notes).toBe('先问清需求')
})

test('saving from the Today panel keeps it open and confirms on the row', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案', { status: 'in_progress' })
  await page.goto('/today')
  await page.getByRole('region', { name: 'In progress' }).getByText('写方案').click()
  await editDetail(page)
  await page.getByRole('textbox', { name: 'Notes', exact: true }).fill('Notes')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(page.getByRole('region', { name: 'In progress' }).getByRole('status')).toHaveText(
    'Saved',
  )
})

// ------------------------------------------------------------------ plan side: carried plans

const rowOf = (page: Page, title: string) =>
  page
    .locator('li')
    .filter({ has: page.locator('[data-today-row]') })
    .filter({ hasText: title })

/*
  A carried plan is for TODAY: it is under Planned for today, and the day it was first meant for is
  said in the row's last column (artboard 12).
*/
test('a plan carried over from days ago says where from; a plan for today does not', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const old = dayOffset(-10)
  await makeTask(page, pid, '搁置的计划', { scheduledOn: old })
  await makeTask(page, pid, '昨天的计划', { scheduledOn: dayOffset(-1) })
  await makeTask(page, pid, '今天的计划', { scheduledOn: dayOffset(0) })
  await page.goto('/today')
  const section = page.getByRole('region', { name: 'Planned for today' })
  await expect(section.getByText('今天的计划')).toBeVisible()

  // Within the week the weekday, before it the date (artboard 12: "Carried from Sun").
  const weekday = (ymd: string) =>
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(`${ymd}T12:00:00Z`).getUTCDay()]
  const date = (ymd: string) => {
    const [, m, d] = ymd.split('-').map(Number)
    return `${MONTHS[m! - 1]} ${d}`
  }
  await expect(rowOf(page, '搁置的计划').locator('[data-date-hint="carried"]')).toHaveText(
    `Carried from ${date(old)}`,
  )
  await expect(rowOf(page, '昨天的计划').locator('[data-date-hint="carried"]')).toHaveText(
    `Carried from ${weekday(dayOffset(-1))}`,
  )
  // Today's own plan carries no mark.
  await expect(rowOf(page, '今天的计划').locator('[data-date-hint]')).toHaveCount(0)
  await expect(page.locator('[data-date-hint="carried"]')).toHaveCount(2)
  // Not an overdue deadline: no overdue block, no overdue wording.
  await expect(page.getByRole('region', { name: 'Overdue' })).toHaveCount(0)
  await expect(section).not.toContainText('late')
})

/**
 * ONE DISCARD ANSWERS ONE QUESTION. Discarding lets the way out it was asked about go through
 * unasked -- and only that one: the next edit in the same sheet is protected again, and its own
 * question is not already open when Edit is pressed.
 */
test('after one Discard, the next unsaved edit in the same sheet is still asked about', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案')
  await makeTask(page, pid, '另一条')
  await openTree(page, pid)
  await page.getByRole('listitem').filter({ hasText: '写方案' }).click()
  const dialog = page.getByRole('dialog')

  await editDetail(page)
  await page.getByLabel('Title').fill('写方案 v2')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('button', { name: 'Discard changes' }).click()
  // Back to reading, the sheet still open on the same task.
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()

  await editDetail(page)
  await expect(dialog.getByText('You have unsaved changes')).toHaveCount(0)
  await page.getByLabel('Title').fill('写方案 v3')
  const here = page.url()
  // Opening another task is a navigation (`?task=`): it must ask, not drop the typing.
  await page.getByRole('listitem').filter({ hasText: '另一条' }).click()
  await expect(dialog).toContainText('You have unsaved changes')
  expect(page.url()).toBe(here)
  await page.getByRole('button', { name: 'Keep editing' }).click()
  await expect(page.getByLabel('Title')).toHaveValue('写方案 v3')
})
