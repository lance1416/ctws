import { expect, test } from '@playwright/test'
import {
  editDetail,
  makeProject,
  makeTask,
  registerFreshUser,
  openTaskPane,
  saveTaskBody,
  serverTask,
  navLink,
  setDue,
} from './helpers'
import { dayOffset, nextMondayYmd, ymd } from './days'

/**
 * THE DETAIL PANE, in the row system's own vocabulary: the five marker shapes, the plan and
 * deadline glyphs, and the same named decisions the row's triage control offers, with an exact
 * field for the days those do not cover. Not a stack of labelled native controls.
 *
 * What these guards are for:
 * - A control that LOOKS right and writes nothing, or writes something else, passes any check on
 *   the screen. So every one of them is asserted on the REQUEST BODY, and then against a fresh
 *   read of the server.
 * - "status is told by shape" and "a plan never looks like a deadline" are claims about drawn
 *   ink, so they are measured, not read off a class name.
 * - "a destructive action is not a peer of Save" is a claim about rank, so it is measured too.
 */

// ------------------------------------------------------------------- status, as shapes not words

test('the status markers write the contract’s own status value', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const id = await makeTask(page, pid, '写方案')
  await openTaskPane(page, pid, '写方案')

  // The task starts at To do, and the group says so without anything being opened.
  await expect(page.getByRole('radio', { name: 'To do', exact: true })).toBeChecked()
  for (const name of ['Backlog', 'In progress', 'Done', 'Cancelled']) {
    await expect(page.getByRole('radio', { name, exact: true })).not.toBeChecked()
  }

  await page.getByRole('radio', { name: 'In progress', exact: true }).check()
  // One field, the contract's own value -- not the label, and nothing else dragged along.
  expect(await saveTaskBody(page)).toEqual({ status: 'in_progress' })
  expect((await serverTask(page, pid, id)).status).toBe('in_progress')

  // And back the other way, so this cannot pass by writing one constant.
  await openTaskPane(page, pid, '写方案')
  await expect(page.getByRole('radio', { name: 'In progress', exact: true })).toBeChecked()
  await page.getByRole('radio', { name: 'Cancelled', exact: true }).check()
  expect(await saveTaskBody(page)).toEqual({ status: 'cancelled' })
  expect((await serverTask(page, pid, id)).status).toBe('cancelled')
})

test('the five statuses are one tab stop and the arrow keys move inside it', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案')
  await openTaskPane(page, pid, '写方案')

  // From the title, one Tab reaches the group -- at the CHECKED member, which is the native
  // radiogroup contract and the reason this is not five buttons.
  await page.getByRole('textbox', { name: 'Title' }).focus()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('radio', { name: 'To do', exact: true })).toBeFocused()

  // The group is in the status model's own order (backlog, todo, in_progress, done, cancelled),
  // so one step right of To do is In progress; arrowing also CHECKS, which is the native contract.
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: 'In progress', exact: true })).toBeFocused()
  await expect(page.getByRole('radio', { name: 'In progress', exact: true })).toBeChecked()

  // One more Tab LEAVES the group entirely: five statuses cost one tab stop, not five.
  await page.keyboard.press('Tab')
  await expect(page.getByRole('radio', { name: 'Done', exact: true })).not.toBeFocused()
  const inGroup = await page.evaluate(
    () => document.activeElement?.closest('[role="radiogroup"]') !== null,
  )
  expect(inGroup, 'Tab left the status group').toBe(false)

  // The arrow press is a real edit: the pane now guards it like any other.
  expect(await saveTaskBody(page)).toEqual({ status: 'in_progress' })
})

// --------------------------------------------------------------------------- the two dates

test('the named deadline decisions write the day the row would show', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const id = await makeTask(page, pid, '交报告')
  await openTaskPane(page, pid, '交报告')

  await page.getByRole('button', { name: 'Due tomorrow', exact: true }).click()
  const body = await saveTaskBody(page)
  expect(Object.keys(body)).toEqual(['dueAt'])
  // A deadline is an instant; what it must get right is the local calendar DAY.
  expect(ymd(new Date(body.dueAt as string))).toBe(dayOffset(1))
  expect(ymd(new Date((await serverTask(page, pid, id)).dueAt!))).toBe(dayOffset(1))

  // "Next week" is the same Monday the row's triage control means.
  //
  // Through TODAY first, and not straight from "tomorrow": on a Sunday next Monday IS tomorrow,
  // the value would not change, and the app is RIGHT to send nothing.
  await openTaskPane(page, pid, '交报告')
  await page.getByRole('button', { name: 'Due today', exact: true }).click()
  await saveTaskBody(page)
  await openTaskPane(page, pid, '交报告')
  await page.getByRole('button', { name: 'Due next week', exact: true }).click()
  expect(ymd(new Date((await saveTaskBody(page)).dueAt as string))).toBe(nextMondayYmd())

  // Moving the day keeps the time of day, exactly as pushing a deadline does on the row. The time is set
  // through the exact field first, and to something that is NOT the default a new deadline gets:
  // with 23:59 on both sides this assertion would hold however the day was moved.
  await openTaskPane(page, pid, '交报告')
  await setDue(page, dayOffset(3), '09:15')
  await saveTaskBody(page)
  const kept = (await serverTask(page, pid, id)).dueAt!
  expect(new Date(kept).getHours(), 'the fixture really is not the 23:59 default').toBe(9)
  await openTaskPane(page, pid, '交报告')
  await page.getByRole('button', { name: 'Due today', exact: true }).click()
  const moved = (await saveTaskBody(page)).dueAt as string
  expect(ymd(new Date(moved))).toBe(dayOffset(0))
  expect(new Date(moved).getHours()).toBe(9)
  expect(new Date(moved).getMinutes()).toBe(15)

  // And the way out sends null, not an empty string the contract would reject.
  await openTaskPane(page, pid, '交报告')
  await page.getByRole('button', { name: 'Clear the deadline', exact: true }).click()
  expect(await saveTaskBody(page)).toEqual({ dueAt: null })
  expect((await serverTask(page, pid, id)).dueAt).toBeNull()
})

test('both dates change in one request, and nothing is saved until Save is pressed', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const id = await makeTask(page, pid, '两样都改')
  await openTaskPane(page, pid, '两样都改')

  const writes: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'PATCH' && /\/tasks\/[^/]+$/.test(r.url())) writes.push(r.url())
  })

  await page.getByRole('button', { name: 'Due today', exact: true }).click()
  await page.getByRole('button', { name: 'Plan for tomorrow', exact: true }).click()
  await page.getByRole('radio', { name: 'In progress', exact: true }).check()
  // Explicit save: three decisions, and the server has heard nothing yet -- these controls do not
  // autosave.
  expect(writes, 'nothing is written before Save').toHaveLength(0)
  expect((await serverTask(page, pid, id)).status).toBe('todo')

  const body = await saveTaskBody(page)
  expect(Object.keys(body).sort()).toEqual(['dueAt', 'scheduledOn', 'status'])
  // The one write is Save's, so the three presses before it sent none.
  expect(writes).toHaveLength(1)
  const after = await serverTask(page, pid, id)
  expect(after.status).toBe('in_progress')
  expect(after.scheduledOn).toBe(dayOffset(1))
  expect(ymd(new Date(after.dueAt!))).toBe(dayOffset(0))
})

test('the edit is the reading, in place: the same rows, each its control', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  // Planned and due, or there would be no line for them to read (I-02).
  await makeTask(page, pid, '原地编辑', {
    scheduledOn: '2019-03-14',
    dueAt: '2019-03-20T10:00:00Z',
  })
  await openTaskPane(page, pid, '原地编辑', false)

  const dialog = page.getByRole('dialog', { name: 'Task details' })
  const names = () => dialog.locator('dl > dt').allTextContents()
  const read = await names()
  expect(read).toEqual(['Status', 'Planned', 'Due'])

  // FR-056: Edit turns the rows into their controls where they stand, the title too.
  await dialog.getByRole('button', { name: 'Edit', exact: true }).click()
  expect((await names()).slice(0, 3)).toEqual(read)
  await expect(dialog.getByRole('textbox', { name: 'Title' })).toHaveValue('原地编辑')
  await expect(dialog.getByRole('radiogroup', { name: 'Status' })).toBeVisible()
  // The date fields keep a name a screen reader says, though the row already shows it.
  await expect(dialog.locator('label[for="detail-due"]')).toHaveText('Due')
  await expect(dialog.locator('label[for="detail-go"]')).toHaveText('Plan')
  // Waiting on is there to add to, behind the same lock as when it is read (P-07).
  await expect(dialog.locator('dl > dt').filter({ hasText: 'Waiting on' })).toHaveCount(1)
  // Save is where Edit was.
  await expect(dialog.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeVisible()
})

test('the status chip wears the app’s focus ring when the keyboard reaches it', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '看焦点')
  await openTaskPane(page, pid, '看焦点')

  // The radio itself is a transparent overlay, so the ring the app draws on every other control
  // has to be drawn on the CHIP, or it is the one control a keyboard user cannot see.
  await page.getByRole('textbox', { name: 'Title' }).focus()
  await page.keyboard.press('Tab')
  const chip = page.getByRole('radio', { name: 'To do', exact: true }).locator('xpath=..')
  const ring = await chip.evaluate((el) => {
    const s = getComputedStyle(el)
    return { width: s.outlineWidth, style: s.outlineStyle, color: s.outlineColor }
  })
  // The ring is the task colour, as everywhere (handoff §4).
  const ink = await page.evaluate(() => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--color-task)'
    document.body.append(probe)
    const c = getComputedStyle(probe).color
    probe.remove()
    return c
  })
  expect(ring.style).toBe('solid')
  expect(parseFloat(ring.width)).toBeGreaterThanOrEqual(2)
  expect(ring.color).toBe(ink)
})

// -------------------------------------------------------------------------- rank and the task

test('the pane opens with the task, and Delete is not a peer of Save', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Workbench')
  await makeTask(page, pid, '这条任务的标题')
  await openTaskPane(page, pid, '这条任务的标题')
  const dialog = page.getByRole('dialog', { name: 'Task details' })

  // The first thing in the pane is where the task lives and what it is called -- not a field
  // label over an input. The project is NAMED (the chip beside it is never the only carrier).
  const title = dialog.getByRole('textbox', { name: 'Title' })
  await expect(title).toHaveValue('这条任务的标题')
  // The project is NAMED on screen, not only coloured: the chip beside it is a second channel.
  // The picker is a button that is both the label and the value, so the name is its accessible
  // name and its text.
  const picker = dialog.getByRole('button', { name: /^Projects/ })
  await expect(picker).toHaveAccessibleName('Projects: Workbench')
  await expect(picker).toHaveText('Workbench')
  const titleSize = await title.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  const notesSize = await dialog
    .getByRole('textbox', { name: 'Notes', exact: true })
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  expect(titleSize, 'the title is the biggest text in the pane').toBeGreaterThan(notesSize)

  // Delete is the edit's last thing, under its rule and apart from Save (FR-035).
  const save = dialog.getByRole('button', { name: 'Save' })
  const del = dialog.getByRole('button', { name: 'Delete task' })
  await expect(del).toBeVisible()
  await expect(save).toBeVisible()
  // It is the last thing in the pane, set apart by a colour used nowhere else, not by a fill.
  const paint = (l: typeof del) =>
    l.evaluate((el) => {
      const s = getComputedStyle(el)
      return { fill: s.backgroundColor, ink: s.color }
    })
  const delPaint = await paint(del)
  expect(
    ['rgba(0, 0, 0, 0)', 'transparent'],
    'the delete control is not a painted block',
  ).toContain(delPaint.fill)
  // Reading offers neither.
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(del).toHaveCount(0)
  await expect(save).toHaveCount(0)
})

test('the pane opens in reading mode with no field, and Edit reveals them', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '只读')
  const id = await makeTask(page, pid, '读一下这条任务', {
    status: 'in_progress',
    dueAt: `${dayOffset(2)}T09:15:00.000Z`,
    // A fixed day in a past year, so it is said with its year whenever the suite runs.
    scheduledOn: '2019-03-14',
    notes: '第一行\n第二行',
  })
  const writes: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'PATCH' || r.method() === 'DELETE') writes.push(r.url())
  })

  await openTaskPane(page, pid, '读一下这条任务', false)
  const dialog = page.getByRole('dialog', { name: 'Task details' })

  // Not one FIELD on screen: no input of any kind, no select, no textarea, and nothing exposed as
  // a textbox / radio / checkbox / combobox either.
  const controls = await dialog.locator('input, select, textarea, [contenteditable]').count()
  expect(controls, 'editable controls in reading mode').toBe(0)
  for (const role of ['textbox', 'radio', 'checkbox', 'combobox', 'spinbutton', 'slider'] as const)
    await expect(dialog.getByRole(role), role).toHaveCount(0)
  // Reading offers no Delete: it is the edit's last thing (FR-035).
  await expect(dialog.getByRole('button', { name: 'Delete task' })).toHaveCount(0)
  // And the information is all there, which is the other half: nothing is behind a second menu.
  await expect(dialog.locator('[data-detail-title]')).toHaveText('读一下这条任务')
  await expect(dialog).toContainText('In progress')
  await expect(dialog).toContainText('只读')
  await expect(dialog.locator('[data-detail-notes]')).toContainText('第二行')
  // Said in the app's own words, never the wire format a reader would have to parse.
  await expect(dialog.getByText(/^\d{4}-\d{2}-\d{2}/)).toHaveCount(0)
  await expect(dialog).toContainText('Mar 14, 2019')

  // Edit brings every one of them back.
  await editDetail(page)
  await expect(dialog.getByRole('textbox', { name: 'Title' })).toHaveValue('读一下这条任务')
  await expect(dialog.getByRole('radio', { name: 'In progress', exact: true })).toBeChecked()
  await expect(dialog.getByLabel('Plan', { exact: true })).toHaveValue('Mar 14, 2019')
  await expect(dialog.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue(
    '第一行\n第二行',
  )
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeVisible()
  // And Delete, last, under its rule.
  await expect(dialog.getByRole('button', { name: 'Delete task' })).toBeVisible()

  // Reading and then choosing to edit wrote nothing on its own: this is not autosave with a
  // read-only skin on it. Save then writes once, so the one write is Save's.
  expect(writes, 'nothing was written by reading or by pressing Edit').toEqual([])
  expect((await serverTask(page, pid, id)).status).toBe('in_progress')
  await dialog.getByRole('textbox', { name: 'Title' }).fill('读完了这条任务')
  await saveTaskBody(page)
  expect(writes).toHaveLength(1)
})

test('Edit hands focus to the first field rather than dropping it on the body', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '按下编辑')
  await openTaskPane(page, pid, '按下编辑', false)
  // The Edit button unmounts as it is pressed; focus must not fall to <body> (WCAG 2.4.3).
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Title' })).toBeFocused()
})

/**
 * THE STATUS IS CHANGED WITHOUT ENTERING THE FORM.
 *
 * One value out of five is a decision, not a composition: there is nothing for a Save to mean,
 * and edit-change-save is a procedure imposed on one press. What is asserted here is the whole of
 * that claim -- it writes, it writes ONCE, the form never opens, and nothing is left unsaved.
 */
test('the status is changed from reading mode, in one act and with no Save', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Status')
  const id = await makeTask(page, pid, '改我的状态')
  const writes: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'PATCH') writes.push(r.url())
  })

  await openTaskPane(page, pid, '改我的状态', false)
  const dialog = page.getByRole('dialog', { name: 'Task details' })

  await dialog.getByRole('button', { name: 'Status: To do' }).click()
  await page.getByRole('menuitem', { name: 'In progress' }).click()

  // The value is on the server, from one request.
  await expect.poll(async () => (await serverTask(page, pid, id)).status).toBe('in_progress')
  expect(writes).toHaveLength(1)
  // The pane is still READING: no form opened behind the menu, and nothing to save.
  await expect(dialog.getByRole('textbox', { name: 'Title' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Save' })).toHaveCount(0)
  // And the control now says what the status is.
  await expect(dialog.getByRole('button', { name: 'Status: In progress' })).toBeVisible()
})

test('finishing a task from its pane keeps focus in the pane', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Stay')
  await makeTask(page, pid, 'Finish me')
  await makeTask(page, pid, 'Neighbour')
  await openTaskPane(page, pid, 'Finish me', false)
  const dialog = page.getByRole('dialog', { name: 'Task details' })

  await dialog.getByRole('button', { name: 'Status: To do' }).click()
  await page.getByRole('menuitem', { name: 'Done' }).click()
  // Its row leaves the tree (finished rows are hidden), but the pane is still open and being read.
  await expect(page.getByRole('button', { name: 'Task: Finish me', exact: true })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Status: Done' })).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')))
    .toBe(true)
})

test('a status change that fails says so', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Flaky')
  const id = await makeTask(page, pid, 'Will not move')
  await openTaskPane(page, pid, 'Will not move', false)
  const dialog = page.getByRole('dialog', { name: 'Task details' })
  await page.route(`**/api/v1/tasks/${id}`, (r) =>
    r.request().method() === 'PATCH' ? r.fulfill({ status: 500, body: '{}' }) : r.continue(),
  )

  await dialog.getByRole('button', { name: 'Status: To do' }).click()
  await page.getByRole('menuitem', { name: 'In progress' }).click()
  await expect(dialog.getByRole('alert')).toContainText("Couldn't change the status")
  // Still what the server holds.
  await expect(dialog.getByRole('button', { name: 'Status: To do' })).toBeVisible()

  // The next change that lands takes the line away.
  await page.unroute(`**/api/v1/tasks/${id}`)
  await dialog.getByRole('button', { name: 'Status: To do' }).click()
  await page.getByRole('menuitem', { name: 'In progress' }).click()
  await expect(dialog.getByRole('button', { name: 'Status: In progress' })).toBeVisible()
  await expect(dialog.getByRole('alert')).toHaveCount(0)
})

test('picking the status it already has writes nothing', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Status')
  await makeTask(page, pid, '不改我的状态')
  const writes: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'PATCH') writes.push(r.url())
  })

  await openTaskPane(page, pid, '不改我的状态', false)
  const dialog = page.getByRole('dialog', { name: 'Task details' })
  await dialog.getByRole('button', { name: 'Status: To do' }).click()
  await page.getByRole('menuitem', { name: 'To do' }).click()

  await expect(dialog.getByRole('button', { name: 'Status: To do' })).toBeVisible()
  expect(writes, 'a no-op pick must not write').toEqual([])
})

test('a status changed from the pane leaves nothing unsaved to walk away from', async ({
  page,
}) => {
  // The leave guard exists for a form with typing in it. A write that already landed has nothing
  // to lose, so it must not stop someone navigating away a second later.
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Status')
  await makeTask(page, pid, '改完就走')

  await openTaskPane(page, pid, '改完就走', false)
  await page.getByRole('dialog').getByRole('button', { name: 'Status: To do' }).click()
  await page.getByRole('menuitem', { name: 'Done' }).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Status: Done' })).toBeVisible()

  await navLink(page, 'Today').click()
  await expect(page).toHaveURL(/\/today$/)
  await expect(page.getByRole('button', { name: 'Keep editing' })).toHaveCount(0)
})

// --------------------------------------------------------------------------- the inspector

test('the task in the inspector: where it sits, its fields a line each, its resources', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Job hunt')
  const amazon = await makeTask(page, pid, 'Amazon')
  const sde = await makeTask(page, pid, 'SDE II', {}, amazon)
  await makeTask(page, pid, 'Prepare the system design round', {}, sde)
  await page
    .context()
    .route(/^https:\/\/docs\.google\.com\//, (r) =>
      r.fulfill({ contentType: 'text/html', body: '<title>outside</title>' }),
    )

  await openTaskPane(page, pid, 'Prepare the system design round', false)
  const dialog = page.getByRole('dialog', { name: 'Task details' })
  // The project's square, then the path down to it (FR-056).
  await expect(dialog.locator('[data-detail-path]')).toHaveText('Job hunt / Amazon / SDE II')
  await expect(dialog.locator('[data-detail-title]')).toHaveText('Prepare the system design round')
  // Only the fields it has a value for: no plan and no deadline, no lines for them (I-02).
  await expect(dialog.locator('dt')).toHaveText(['Status'])
  await expect(dialog.getByRole('button', { name: 'Status: To do' })).toBeVisible()

  // A resource, named, with where it is from.
  await dialog.getByRole('button', { name: 'Add a resource' }).click()
  const form = page.getByRole('form', { name: 'Add a resource' })
  await form.getByLabel('Address').fill('https://docs.google.com/document/d/prep/edit')
  await form.getByLabel('Name (optional)').fill('System design prep')
  await form.getByRole('button', { name: 'Add' }).click()
  const resource = dialog.locator('[data-resource]')
  await expect(resource).toHaveText('System design prepGoogle Doc')
  await expect(resource).toHaveAttribute('href', 'https://docs.google.com/document/d/prep/edit')

  // Its timeline, newest first, in the module's words (FR-045).
  await dialog.getByRole('button', { name: 'Status: To do' }).click()
  await page.getByRole('menuitem', { name: 'In progress' }).click()
  const timeline = dialog.getByRole('region', { name: 'Timeline' })
  await expect(timeline.locator('[data-timeline-entry]').first()).toContainText('Started')
  await expect(timeline.locator('[data-timeline-entry]').last()).toContainText('Created')

  // A parent: no plan of its own, and a status that is its children's (FR-038, FR-043).
  await openTaskPane(page, pid, 'SDE II', false)
  await expect(dialog.locator('dt')).toHaveText(['Status'])
  await expect(dialog.getByRole('button', { name: /^Status:/ })).toHaveCount(0)
  // In progress, because the task under it was started above: said, not offered to change.
  await expect(dialog.locator('dd').first()).toHaveText('In progress')
})

test('away from its project, the inspector opens a task’s full page: its project, with it open', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '外面')
  await makeTask(page, pid, '在别处打开', { status: 'in_progress' })
  await page.goto('/today')
  await page.locator('[data-today-row]').filter({ hasText: '在别处打开' }).click()
  const dialog = page.getByRole('dialog', { name: 'Task details' })
  await dialog.getByRole('link', { name: 'Open full page' }).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${pid}\?.*task=`))
  await expect(dialog.locator('[data-detail-title]')).toHaveText('在别处打开')
  // On its own project's page it already is where its full page is: no such button there.
  await expect(dialog.getByRole('link', { name: 'Open full page' })).toHaveCount(0)
})

test('Ctrl Enter saves the edit from any field (FR-029)', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Keys')
  await makeTask(page, pid, '按键保存')
  await openTaskPane(page, pid, '按键保存')
  const dialog = page.getByRole('dialog', { name: 'Task details' })
  await dialog.getByRole('textbox', { name: 'Title' }).fill('按键保存了')
  await dialog.getByRole('textbox', { name: 'Notes', exact: true }).click()
  await page.keyboard.press('Control+Enter')
  // Back to reading, with what was typed.
  await expect(dialog.locator('[data-detail-title]')).toHaveText('按键保存了')
  await expect(dialog.getByRole('button', { name: 'Save' })).toHaveCount(0)
})
