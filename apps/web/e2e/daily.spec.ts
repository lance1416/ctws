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
import { DAY, dayOffset, dueAgo, MONTHS, nextMondayYmd, ymd } from './days'

// The daily loop: finishing, starting and deferring work from the list itself, the dates a tree
// row shows, and the panel / delete guards. Every assertion that a status or date changed reads
// the SERVER (a fresh GET), not the screen: an optimistic update that never reached the API
// would pass any check that only looks at the UI.

/**
 * The row's date control: an overdue or carried row's date actions, inside one disclosure.
 *
 * The trigger's name deliberately does not CONTAIN either group name, so `getByRole` -- which
 * matches accessible names by substring -- cannot confuse the two.
 */
const triage = (page: Page, title: string) =>
  page.getByRole('button', { name: `Change the dates for “${title}”` })

/** Opens a row's date control and returns the panel, asserting it actually opened. */
async function openTriage(page: Page, title: string, kind: 'Overdue' | 'Carried over') {
  await triage(page, title).click()
  const panel = page.getByRole('group', { name: `${kind}: ${title}` })
  await expect(panel).toBeVisible()
  return panel
}

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

test('a finished task can be restored from its mark, landing on backlog', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案', { status: 'done' })
  await openTree(page, pid)
  // It arrived already finished, so the tree starts without it; the count is the way in.
  await expect(treeRow(page, '写方案')).toHaveCount(0)
  await page.getByRole('button', { name: '1 done' }).click()

  const restored = taskPatched(page)
  await page.getByRole('button', { name: 'Reopen “写方案”' }).click()
  expect((await restored).request().postDataJSON()).toEqual({ status: 'backlog' })
  expect((await serverTask(page, pid, '写方案')).status).toBe('backlog')
  await page.reload()
  await expect(treeRow(page, '写方案').getByRole('img', { name: 'Backlog' })).toBeVisible()
})

test('starting a task from its row puts it under In progress, stopping takes it off', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案')
  await openTree(page, pid)

  // A dateless, not-started task is not on the Today page at all.
  await page.getByRole('link', { name: 'Today' }).click()
  await expect(page.getByText('Nothing for today')).toBeVisible()
  await page.goBack()
  await page.getByRole('listitem').first().waitFor()

  const started = taskPatched(page)
  await page.getByRole('button', { name: 'Start “写方案”' }).click()
  expect((await started).request().postDataJSON()).toEqual({ status: 'in_progress' })
  expect((await serverTask(page, pid, '写方案')).status).toBe('in_progress')

  await page.getByRole('link', { name: 'Today' }).click()
  await expect(page.getByRole('region', { name: 'In progress' }).getByText('写方案')).toBeVisible()

  // Stop it from the Today row: it has no date, so it leaves the page.
  const stopped = taskPatched(page)
  await page.getByRole('button', { name: 'Pause “写方案”' }).click()
  expect((await stopped).request().postDataJSON()).toEqual({ status: 'todo' })
  await expect(page.getByText('Nothing for today')).toBeVisible()
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
  expect((await res).request().postDataJSON()).toEqual({ status: 'backlog' })

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

test('pushing the deadline on an overdue row keeps its time of day and takes the row out of Overdue', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const due = dueAgo(2)
  await makeTask(page, pid, '推到明天', { dueAt: due })
  await makeTask(page, pid, '推到下周', { dueAt: due })
  await makeTask(page, pid, '不动的', { dueAt: due })
  await page.goto('/today')
  const section = page.getByRole('region', { name: 'Overdue' })
  await expect(section.getByText('2 days late')).toHaveCount(3)

  // The same local time of day, on another local day.
  const onDay = (days: number) => {
    const d = new Date(due)
    return new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate() + days,
      d.getHours(),
      d.getMinutes(),
      d.getSeconds(),
      d.getMilliseconds(),
    )
  }
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const expectTomorrow = new Date(
    tomorrow.getFullYear(),
    tomorrow.getMonth(),
    tomorrow.getDate(),
    onDay(0).getHours(),
    onDay(0).getMinutes(),
    onDay(0).getSeconds(),
    onDay(0).getMilliseconds(),
  )

  let res = taskPatched(page)
  await (
    await openTriage(page, '推到明天', 'Overdue')
  )
    .getByRole('button', { name: 'To tomorrow' })
    .click()
  // The request moves the deadline and nothing else.
  expect((await res).request().postDataJSON()).toEqual({ dueAt: expectTomorrow.toISOString() })
  // The row left Overdue; the other two overdue rows did not move.
  await expect(page.getByText('推到明天')).toHaveCount(0)
  await expect(section.getByText('2 days late')).toHaveCount(2)
  // The server says so, from a fresh read, in its own segment arithmetic: not on the list at all.
  const today = (await (await page.request.get('/api/v1/tasks?view=today')).json()).tasks as {
    title: string
    segment: string
  }[]
  expect(today.find((t) => t.title === '推到明天')).toBeUndefined()
  expect(
    today
      .filter((t) => t.segment === 'overdue')
      .map((t) => t.title)
      .sort(),
  ).toEqual(['不动的', '推到下周'])
  const moved = await serverTask(page, pid, '推到明天')
  expect(new Date(moved.dueAt!).getTime()).toBe(expectTomorrow.getTime())
  // No scheduling was invented on the way.
  expect(moved.scheduledOn).toBeNull()
  await page.reload()
  await expect(page.getByText('推到明天')).toHaveCount(0)

  // Next week is the coming Monday, at the same time of day.
  const now = new Date()
  const toMonday = (8 - now.getDay()) % 7 || 7
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + toMonday,
    onDay(0).getHours(),
    onDay(0).getMinutes(),
    onDay(0).getSeconds(),
    onDay(0).getMilliseconds(),
  )
  res = taskPatched(page)
  await (
    await openTriage(page, '推到下周', 'Overdue')
  )
    .getByRole('button', { name: 'To next week' })
    .click()
  expect((await res).request().postDataJSON()).toEqual({ dueAt: monday.toISOString() })
  await expect(page.getByText('推到下周')).toHaveCount(0)
  expect(new Date((await serverTask(page, pid, '推到下周')).dueAt!).getTime()).toBe(
    monday.getTime(),
  )
  // The untouched one is still overdue on the server.
  expect(new Date((await serverTask(page, pid, '不动的')).dueAt!).getTime()).toBe(
    new Date(due).getTime(),
  )
  await expect(section.getByText('不动的')).toBeVisible()
})

test('only a deadline change takes a task out of Overdue: a bare scheduledOn does not', async ({
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

  // Scheduling it for tomorrow must NOT hide the missed deadline.
  const p = await page.request.patch(`/api/v1/tasks/${id}`, {
    headers: WEB,
    data: { scheduledOn: tomorrow },
  })
  expect(p.status()).toBe(200)
  expect((await serverTask(page, pid, '过期了')).scheduledOn).toBe(tomorrow)
  expect(await segmentOf()).toBe('overdue')
  await page.goto('/today')
  await expect(page.getByRole('region', { name: 'Overdue' }).getByText('过期了')).toBeVisible()

  // Whereas moving the deadline itself does take it out.
  const q = await page.request.patch(`/api/v1/tasks/${id}`, {
    headers: WEB,
    data: { dueAt: new Date(Date.now() + 3 * DAY).toISOString() },
  })
  expect(q.status()).toBe(200)
  expect(await segmentOf()).not.toBe('overdue')
})

test('clearing the deadline takes a row out of Overdue and the server forgets it', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '不再重要', { dueAt: dueAgo(3) })
  await makeTask(page, pid, '要留下', { dueAt: dueAgo(1) })
  await page.goto('/today')
  const section = page.getByRole('region', { name: 'Overdue' })
  await expect(section.getByText('不再重要')).toBeVisible()

  const res = taskPatched(page)
  await (
    await openTriage(page, '不再重要', 'Overdue')
  )
    .getByRole('button', { name: 'Clear the deadline' })
    .click()
  expect((await res).request().postDataJSON()).toEqual({ dueAt: null })
  await expect(page.getByText('不再重要')).toHaveCount(0)
  // The other overdue row is untouched, and focus went to it rather than to <body>.
  await expect(section.getByText('要留下')).toBeVisible()
  await expect(page.locator('[data-today-row]').filter({ hasText: '要留下' })).toBeFocused()
  expect((await serverTask(page, pid, '不再重要')).dueAt).toBeNull()
  expect((await serverTask(page, pid, '要留下')).dueAt).not.toBeNull()
  await page.reload()
  await expect(page.getByText('不再重要')).toHaveCount(0)
})

test('an overdue row is finished with its mark, and only overdue rows have the exits', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '逾期的', { dueAt: dueAgo(2) })
  await makeTask(page, pid, '在做的', { status: 'in_progress' })
  await page.goto('/today')
  // Exactly one date control on the page: the overdue row has one, the in-progress row has none.
  await expect(page.locator('[data-triage-trigger]')).toHaveCount(1)
  await expect(triage(page, '逾期的')).toBeVisible()
  await expect(triage(page, '在做的')).toHaveCount(0)

  // Opening it offers the same two exits it always did, and nothing is reachable while it is shut.
  await expect(page.getByRole('button', { name: 'To tomorrow' })).toHaveCount(0)
  const panel = await openTriage(page, '逾期的', 'Overdue')
  await expect(panel.getByRole('button', { name: 'To tomorrow' })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'To next week' })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Clear the deadline' })).toBeVisible()
  // Escape shuts it and hands focus back to the trigger rather than to <body> (WCAG 2.4.3).
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(triage(page, '逾期的')).toBeFocused()

  const res = taskPatched(page)
  await page.getByRole('button', { name: 'Complete “逾期的”' }).click()
  expect((await res).request().postDataJSON()).toEqual({ status: 'done' })
  await expect(page.getByRole('region', { name: 'Overdue' })).toHaveCount(0)
  expect((await serverTask(page, pid, '逾期的')).status).toBe('done')
})

// ---------------------------------------------------------------------------------- dates in tree

test('the tree shows dates only where they mean something', async ({ page }) => {
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
  await makeTask(page, pid, '已完成逾期', { dueAt: dueAgo(9), status: 'done' })
  await openTree(page, pid)

  const lead = (title: string) => treeRow(page, title).locator('[data-row-lead]')
  const d = new Date(lateDue)
  // The margin says WHEN in one word, and the moment in full is its title: an overdue row the day
  // it was due, flagged, with how late on the right.
  await expect(lead('逾期的')).toHaveAttribute('data-row-lead', 'missed')
  await expect(lead('逾期的').locator('[data-row-lead-text]')).toHaveText(
    `${MONTHS[d.getMonth()]} ${d.getDate()}`,
  )
  await expect(treeRow(page, '逾期的').locator('[data-row-note]')).toHaveText('5 days late')
  // Due today at the end of the day is a day, not a minute before midnight.
  await expect(lead('今天截止')).toHaveAttribute('data-row-lead', 'deadline')
  await expect(lead('今天截止').locator('[data-row-lead-text]')).toHaveText('23:30')
  await expect(lead('只排期')).toHaveAttribute('data-row-lead', 'plan')
  // Tomorrow by its weekday, as a deadline is: "Tomorrow" is wider than a phone's margin.
  const planned = ymd(new Date(now.getTime() + DAY))
  await expect(lead('只排期').locator('[data-row-lead-text]')).toHaveText(
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
      new Date(`${planned}T12:00:00Z`).getUTCDay()
    ]!,
  )
  // A dateless row and a finished row say nothing in the margin: the row is still a row.
  await expect(lead('没日期').locator('[data-row-lead-text]')).toHaveCount(0)
  await expect(lead('已完成逾期').locator('[data-row-lead-text]')).toHaveCount(0)

  // Overdue is told apart by its words as well as its colour, and the due-today row never says it.
  await expect(treeRow(page, '今天截止')).not.toContainText('late')
})

// ----------------------------------------------------------------------------- destructive guards

test('deleting a project asks first, names what is lost, and cancel deletes nothing', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '待删项目')
  for (const t of ['一', '二', '三']) await makeTask(page, pid, t)
  // At the foot of the project's own page, which is the only place it is offered from.
  await page.goto(`/projects/${pid}`)
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

  test('closing a panel with unsaved edits asks; keep editing keeps them, discard drops them', async ({
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

    // Every way out asks: stepping back to reading (Cancel), closing the pane (the ✕), Escape,
    // and a click outside.
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toContainText('You have unsaved changes')
    await page.getByRole('button', { name: 'Keep editing' }).click()
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('You have unsaved changes')
    await page.getByRole('button', { name: 'Keep editing' }).click()
    await expect(dialog.getByText('You have unsaved changes')).toHaveCount(0)
    await expect(page.getByLabel('Title')).toHaveValue('写方案 v2')

    await page.getByLabel('Title').press('Escape')
    await expect(dialog).toContainText('You have unsaved changes')
    await page.keyboard.press('Escape') // a second Escape on the prompt means keep editing
    await expect(dialog.getByText('You have unsaved changes')).toHaveCount(0)
    await expect(dialog).toBeVisible()

    await page.mouse.click(60, 600)
    await expect(dialog).toContainText('You have unsaved changes')

    await page.getByRole('button', { name: 'Discard changes' }).click()
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
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toContainText('You have unsaved changes')
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
async function todaySegment(page: Page, id: string): Promise<string> {
  const tasks = (await (await page.request.get('/api/v1/tasks?view=today')).json()).tasks as {
    id: string
    segment: string
  }[]
  return tasks.find((t) => t.id === id)?.segment ?? 'absent'
}

/*
  A carried plan is for TODAY, at no particular time: it belongs under Any time, and the day it was
  first meant for is said on the right, not in the margin, whose words on this list are times.
*/
test('a plan carried over from days ago says so on Today, under Any time; a plan for today does not', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const old = dayOffset(-5)
  await makeTask(page, pid, '搁置的计划', { scheduledOn: old })
  await makeTask(page, pid, '昨天的计划', { scheduledOn: dayOffset(-1) })
  await makeTask(page, pid, '今天的计划', { scheduledOn: dayOffset(0) })
  await page.goto('/today')
  const section = page.getByRole('region', { name: 'Today', exact: true })
  await expect(section.getByText('今天的计划')).toBeVisible()

  // The margin is the day's: "Any time" once, on the first row, and no old date anywhere on it.
  await expect(section.locator('[data-row-lead-text]')).toHaveText(['Any time'])
  await expect(section.locator('li').first()).toContainText('Any time')
  // The day it was meant for is on the right.
  const day = (ymd: string) => {
    const [, m, d] = ymd.split('-').map(Number)
    return `${MONTHS[m! - 1]} ${d}`
  }
  await expect(rowOf(page, '搁置的计划').locator('[data-date-hint="carried"]')).toHaveText(
    `Carried over from ${day(old)}`,
  )
  await expect(rowOf(page, '昨天的计划').locator('[data-date-hint="carried"]')).toHaveText(
    `Carried over from ${day(dayOffset(-1))}`,
  )
  // Today's own plan carries no mark and no triage group.
  await expect(rowOf(page, '今天的计划').locator('[data-date-hint]')).toHaveCount(0)
  await expect(triage(page, '今天的计划')).toHaveCount(0)
  await expect(page.locator('[data-date-hint="carried"]')).toHaveCount(2)
  // Not an overdue deadline: no overdue segment, no overdue wording.
  await expect(page.getByRole('region', { name: 'Overdue' })).toHaveCount(0)
  await expect(section).not.toContainText('late')
})

test('moving the plan to today keeps the row, drops the mark, and changes only the plan', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const id = await makeTask(page, pid, '改到今天的', { scheduledOn: dayOffset(-3) })
  await makeTask(page, pid, '旁观者', { scheduledOn: dayOffset(-3) })
  await page.goto('/today')
  const res = taskPatched(page)
  await (
    await openTriage(page, '改到今天的', 'Carried over')
  )
    .getByRole('button', { name: 'Move to today' })
    .click()
  expect((await res).request().postDataJSON()).toEqual({ scheduledOn: dayOffset(0) })

  // The row stays but is no longer carried, so its date control goes with the mark.
  await expect(triage(page, '改到今天的')).toHaveCount(0)
  await expect(rowOf(page, '改到今天的').locator('[data-date-hint="carried"]')).toHaveCount(0)
  await expect(
    page.getByRole('region', { name: 'Today', exact: true }).getByText('改到今天的'),
  ).toBeVisible()
  // The neighbour is untouched and still marked.
  await expect(triage(page, '旁观者')).toBeVisible()
  expect((await serverTask(page, pid, '改到今天的')).scheduledOn).toBe(dayOffset(0))
  expect((await serverTask(page, pid, '旁观者')).scheduledOn).toBe(dayOffset(-3))
  expect(await todaySegment(page, id)).toBe('today')
  await page.reload()
  await expect(page.getByText('改到今天的')).toBeVisible()
  await expect(triage(page, '改到今天的')).toHaveCount(0)
})

test('moving the plan to tomorrow or next week takes the row off Today', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const a = await makeTask(page, pid, '改到明天的', { scheduledOn: dayOffset(-2) })
  const b = await makeTask(page, pid, '改到下周的', { scheduledOn: dayOffset(-2) })
  await makeTask(page, pid, '留着的', { scheduledOn: dayOffset(-2) })
  await page.goto('/today')

  let res = taskPatched(page)
  await (
    await openTriage(page, '改到明天的', 'Carried over')
  )
    .getByRole('button', { name: 'Move to tomorrow' })
    .click()
  expect((await res).request().postDataJSON()).toEqual({ scheduledOn: dayOffset(1) })
  await expect(page.getByText('改到明天的')).toHaveCount(0)
  expect((await serverTask(page, pid, '改到明天的')).scheduledOn).toBe(dayOffset(1))
  expect(await todaySegment(page, a)).toBe('absent')

  res = taskPatched(page)
  await (
    await openTriage(page, '改到下周的', 'Carried over')
  )
    .getByRole('button', { name: 'Move to next week' })
    .click()
  expect((await res).request().postDataJSON()).toEqual({ scheduledOn: nextMondayYmd() })
  await expect(page.getByText('改到下周的')).toHaveCount(0)
  expect((await serverTask(page, pid, '改到下周的')).scheduledOn).toBe(nextMondayYmd())
  expect(await todaySegment(page, b)).toBe('absent')

  // The one nobody touched is still there and still carried.
  await expect(triage(page, '留着的')).toBeVisible()
  await expect(rowOf(page, '留着的').locator('[data-date-hint="carried"]')).toBeVisible()
  await expect(page.locator('[data-today-row]')).toHaveCount(1)
  await page.reload()
  await expect(page.locator('[data-today-row]')).toHaveCount(1)
})

test('clearing the plan removes the row from Today and the server holds none', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const id = await makeTask(page, pid, '不排了', { scheduledOn: dayOffset(-4) })
  await makeTask(page, pid, '另一个', { scheduledOn: dayOffset(-4) })
  await page.goto('/today')
  const res = taskPatched(page)
  await (
    await openTriage(page, '不排了', 'Carried over')
  )
    .getByRole('button', { name: 'Clear the plan' })
    .click()
  expect((await res).request().postDataJSON()).toEqual({ scheduledOn: null })
  await expect(page.getByText('不排了')).toHaveCount(0)

  const t = await serverTask(page, pid, '不排了')
  expect(t.scheduledOn).toBeNull()
  expect(t.status).toBe('todo') // the task still exists, untouched: only the plan went
  expect(await todaySegment(page, id)).toBe('absent')
  await page.reload()
  await expect(page.getByText('不排了')).toHaveCount(0)
  await expect(page.getByText('另一个')).toBeVisible()
})

test('a carried plan is not a deadline: clearing the plan leaves dueAt alone', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const due = new Date()
  due.setHours(23, 0, 0, 0)
  await makeTask(page, pid, '计划和今晚截止', {
    scheduledOn: dayOffset(-2),
    dueAt: due.toISOString(),
  })
  await page.goto('/today')
  await expect(triage(page, '计划和今晚截止')).toBeVisible()
  const res = taskPatched(page)
  await (
    await openTriage(page, '计划和今晚截止', 'Carried over')
  )
    .getByRole('button', { name: 'Clear the plan' })
    .click()
  await res
  const t = await serverTask(page, pid, '计划和今晚截止')
  expect(t.scheduledOn).toBeNull()
  expect(new Date(t.dueAt!).getTime()).toBe(due.getTime())
  // It is still due today, so it stays on the list, no longer marked.
  await expect(page.getByText('计划和今晚截止')).toBeVisible()
  await expect(triage(page, '计划和今晚截止')).toHaveCount(0)
})

test('making a deadline a plan moves the row out of Overdue into Today, with dueAt gone', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const id = await makeTask(page, pid, '没人在等', { dueAt: dueAgo(3) })
  await makeTask(page, pid, '转到明天', { dueAt: dueAgo(3) })
  await makeTask(page, pid, '还逾期', { dueAt: dueAgo(3) })
  await page.goto('/today')
  const overdue = page.getByRole('region', { name: 'Overdue' })
  await expect(overdue.getByText('3 days late')).toHaveCount(3)
  expect(await todaySegment(page, id)).toBe('overdue')

  let res = taskPatched(page)
  await (
    await openTriage(page, '没人在等', 'Overdue')
  )
    .getByRole('button', { name: 'Today', exact: true })
    .click()
  // One request carries both halves of the change.
  expect((await res).request().postDataJSON()).toEqual({ dueAt: null, scheduledOn: dayOffset(0) })

  await expect(overdue.getByText('没人在等')).toHaveCount(0)
  await expect(
    page.getByRole('region', { name: 'Today', exact: true }).getByText('没人在等'),
  ).toBeVisible()
  const t = await serverTask(page, pid, '没人在等')
  expect(t.dueAt).toBeNull()
  expect(t.scheduledOn).toBe(dayOffset(0))
  expect(await todaySegment(page, id)).toBe('today')
  // A plan for today is quiet: no carried mark and no date control.
  await expect(triage(page, '没人在等')).toHaveCount(0)
  await expect(rowOf(page, '没人在等').locator('[data-date-hint]')).toHaveCount(0)
  await page.reload()
  await expect(
    page.getByRole('region', { name: 'Today', exact: true }).getByText('没人在等'),
  ).toBeVisible()

  // Demoting to tomorrow leaves the list altogether; the neighbour stays overdue.
  res = taskPatched(page)
  await (
    await openTriage(page, '转到明天', 'Overdue')
  )
    .getByRole('button', { name: 'Tomorrow', exact: true })
    .click()
  expect((await res).request().postDataJSON()).toEqual({ dueAt: null, scheduledOn: dayOffset(1) })
  await expect(page.getByText('转到明天')).toHaveCount(0)
  const t2 = await serverTask(page, pid, '转到明天')
  expect(t2.dueAt).toBeNull()
  expect(t2.scheduledOn).toBe(dayOffset(1))
  expect(new Date((await serverTask(page, pid, '还逾期')).dueAt!).getTime()).toBeLessThan(
    Date.now(),
  )
  await expect(overdue.getByText('还逾期')).toBeVisible()
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
