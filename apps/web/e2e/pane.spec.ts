import { expect, test, type Page } from '@playwright/test'
import { editDetail, makeProject, makeTask, registerFreshUser } from './helpers'
import { dayAfter, dayOffset, nextMondayYmd, ymd } from './days'

/** The month names the app prints, so a spec can build the string the page will show. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * THE DETAIL PANE, in the row system's own vocabulary: the five marker shapes, the plan and
 * deadline glyphs, and the same named decisions the row's triage control offers, with an exact
 * field for the days those do not cover. Not a stack of labelled native controls.
 *
 * What these guards are for:
 * - A control that LOOKS right and writes nothing, or writes something else, is the exact failure
 *   a redesign makes easy. So every one of them is asserted on the REQUEST BODY, against the
 *   values the controls they replace used to send, and then against a fresh read of the server.
 * - "status is told by shape" and "a plan never looks like a deadline" are claims about drawn
 *   ink, so they are measured, not read off a class name.
 * - "a destructive action is not a peer of Save" is a claim about rank, so it is measured too.
 */

type ServerTask = {
  id: string
  status: string
  dueAt: string | null
  scheduledOn: string | null
}
async function serverTask(page: Page, projectId: string, id: string): Promise<ServerTask> {
  const body = (await (await page.request.get(`/api/v1/projects/${projectId}/tasks`)).json()) as {
    tasks: ServerTask[]
  }
  const task = body.tasks.find((t) => t.id === id)
  expect(task, 'the task is still in the project').toBeTruthy()
  return task!
}

const isPatch = (r: { url: () => string; request: () => { method: () => string } }) =>
  /\/tasks\/[^/]+$/.test(r.url()) && r.request().method() === 'PATCH'

/** Presses Save and returns the PATCH the press produced, so the BODY can be asserted. */
/** The calendar day after `day`, as a plain date string. */

async function saveBody(page: Page): Promise<Record<string, unknown>> {
  const done = page.waitForResponse((r) => isPatch(r) && r.ok())
  await page.getByRole('button', { name: 'Save' }).click()
  const res = await done
  return res.request().postDataJSON() as Record<string, unknown>
}

/**
 * Opens a task's pane. `edit` presses Edit, because the pane opens in READING mode and the controls
 * these tests are about exist only in editing mode. What each control WRITES is asserted exactly as
 * before, on the request body.
 */
async function openPane(page: Page, projectId: string, title: string, edit = true) {
  await page.goto(`/projects/${projectId}`)
  await page.getByRole('listitem').filter({ hasText: title }).first().click()
  await expect(page.getByRole('dialog', { name: 'Task details' })).toBeVisible()
  if (edit) await editDetail(page)
}

// ------------------------------------------------------------------- status, as shapes not words

test('the status markers write exactly what the status dropdown wrote', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const id = await makeTask(page, pid, '写方案')
  await openPane(page, pid, '写方案')

  // The task starts at To do, and the group says so without anything being opened -- which is
  // the whole complaint about the <select> it replaces.
  await expect(page.getByRole('radio', { name: 'To do', exact: true })).toBeChecked()
  for (const name of ['Backlog', 'In progress', 'Done', 'Cancelled']) {
    await expect(page.getByRole('radio', { name, exact: true })).not.toBeChecked()
  }

  await page.getByRole('radio', { name: 'In progress', exact: true }).check()
  // One field, the contract's own value -- not the label, and nothing else dragged along.
  expect(await saveBody(page)).toEqual({ status: 'in_progress' })
  expect((await serverTask(page, pid, id)).status).toBe('in_progress')

  // And back the other way, so this cannot pass by writing one constant.
  await openPane(page, pid, '写方案')
  await expect(page.getByRole('radio', { name: 'In progress', exact: true })).toBeChecked()
  await page.getByRole('radio', { name: 'Cancelled', exact: true }).check()
  expect(await saveBody(page)).toEqual({ status: 'cancelled' })
  expect((await serverTask(page, pid, id)).status).toBe('cancelled')
})

test('the five statuses are one tab stop and the arrow keys move inside it', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案')
  await openPane(page, pid, '写方案')

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
  expect(await saveBody(page)).toEqual({ status: 'in_progress' })
})

// --------------------------------------------------------------------------- the two dates

test('the named deadline decisions write the day the row would show', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const id = await makeTask(page, pid, '交报告')
  await openPane(page, pid, '交报告')

  await page.getByRole('button', { name: 'Due tomorrow', exact: true }).click()
  const body = await saveBody(page)
  expect(Object.keys(body)).toEqual(['dueAt'])
  // A deadline is an instant; what it must get right is the local calendar DAY.
  expect(ymd(new Date(body.dueAt as string))).toBe(dayOffset(1))
  expect(ymd(new Date((await serverTask(page, pid, id)).dueAt!))).toBe(dayOffset(1))

  // "Next week" is the same Monday the row's triage control means.
  //
  // Through TODAY first, and not straight from "tomorrow": on a Sunday next Monday IS tomorrow,
  // the value would not change, and the app is RIGHT to send nothing -- which used to hang this
  // test one day in seven (`days.ts` records the Thursday version of the same trap).
  await openPane(page, pid, '交报告')
  await page.getByRole('button', { name: 'Due today', exact: true }).click()
  await saveBody(page)
  await openPane(page, pid, '交报告')
  await page.getByRole('button', { name: 'Due next week', exact: true }).click()
  expect(ymd(new Date((await saveBody(page)).dueAt as string))).toBe(nextMondayYmd())

  // Moving the day keeps the time of day, exactly as pushing a deadline does on the row. The time is set
  // through the exact field first, and to something that is NOT the default a new deadline gets:
  // with 23:59 on both sides this assertion would hold however the day was moved.
  await openPane(page, pid, '交报告')
  await page.getByLabel('Due', { exact: true }).fill(`${dayOffset(3)}T09:15`)
  await saveBody(page)
  const kept = (await serverTask(page, pid, id)).dueAt!
  expect(new Date(kept).getHours(), 'the fixture really is not the 23:59 default').toBe(9)
  await openPane(page, pid, '交报告')
  await page.getByRole('button', { name: 'Due today', exact: true }).click()
  const moved = (await saveBody(page)).dueAt as string
  expect(ymd(new Date(moved))).toBe(dayOffset(0))
  expect(new Date(moved).getHours()).toBe(9)
  expect(new Date(moved).getMinutes()).toBe(15)

  // And the way out sends null, not an empty string the contract would reject.
  await openPane(page, pid, '交报告')
  await page.getByRole('button', { name: 'Clear the deadline', exact: true }).click()
  expect(await saveBody(page)).toEqual({ dueAt: null })
  expect((await serverTask(page, pid, id)).dueAt).toBeNull()
})

test('the named plan decisions write the same scheduledOn the exact field writes', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const id = await makeTask(page, pid, '改简历')
  await openPane(page, pid, '改简历')

  await page.getByRole('button', { name: 'Plan for tomorrow', exact: true }).click()
  expect(await saveBody(page)).toEqual({ scheduledOn: dayOffset(1) })
  expect((await serverTask(page, pid, id)).scheduledOn).toBe(dayOffset(1))

  // The named decision and the exact field are two ways to the SAME field, not two fields.
  await openPane(page, pid, '改简历')
  await expect(page.getByLabel('Plan', { exact: true })).toHaveValue(dayOffset(1))
  // THE DAY AFTER NEXT MONDAY, not a fixed offset. `dayOffset(4)` is next Monday whenever this
  // runs on a Thursday, and then "next week" below writes the value already stored -- the form is
  // not dirty, no request is sent, and the test hangs waiting for one. It did, on a Thursday.
  const afterNextMonday = dayAfter(nextMondayYmd())
  await page.getByLabel('Plan', { exact: true }).fill(afterNextMonday)
  expect(await saveBody(page)).toEqual({ scheduledOn: afterNextMonday })

  await openPane(page, pid, '改简历')
  await page.getByRole('button', { name: 'Plan for next week', exact: true }).click()
  await expect(page.getByLabel('Plan', { exact: true })).toHaveValue(nextMondayYmd())
  expect(await saveBody(page)).toEqual({ scheduledOn: nextMondayYmd() })

  await openPane(page, pid, '改简历')
  await page.getByRole('button', { name: 'Clear the plan', exact: true }).click()
  await expect(page.getByLabel('Plan', { exact: true })).toHaveValue('')
  expect(await saveBody(page)).toEqual({ scheduledOn: null })
  expect((await serverTask(page, pid, id)).scheduledOn).toBeNull()
})

test('both dates change in one request, and nothing is saved until Save is pressed', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const id = await makeTask(page, pid, '两样都改')
  await openPane(page, pid, '两样都改')

  const writes: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'PATCH' && /\/tasks\/[^/]+$/.test(r.url())) writes.push(r.url())
  })

  await page.getByRole('button', { name: 'Due today', exact: true }).click()
  await page.getByRole('button', { name: 'Plan for tomorrow', exact: true }).click()
  await page.getByRole('radio', { name: 'In progress', exact: true }).check()
  // Explicit save: three decisions, and the server has heard nothing yet. (This is the guard on
  // the rule that these controls did NOT become autosave.)
  await page.waitForTimeout(300)
  expect(writes, 'nothing is written before 保存').toHaveLength(0)
  expect((await serverTask(page, pid, id)).status).toBe('todo')

  const body = await saveBody(page)
  expect(Object.keys(body).sort()).toEqual(['dueAt', 'scheduledOn', 'status'])
  expect(writes).toHaveLength(1)
  const after = await serverTask(page, pid, id)
  expect(after.status).toBe('in_progress')
  expect(after.scheduledOn).toBe(dayOffset(1))
  expect(ymd(new Date(after.dueAt!))).toBe(dayOffset(0))
})

test('the pane says the day back in the app’s own words, not the field’s format', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '看日期')
  await openPane(page, pid, '看日期')

  const dialog = page.getByRole('dialog', { name: 'Task details' })
  await page.getByRole('button', { name: 'Plan for tomorrow', exact: true }).click()
  // A native date input prints its format in the BROWSER'S UI language, which no page can set;
  // the echo is the app saying which day it understood, and it is right whatever the field prints.
  await expect(dialog.getByText('Tomorrow', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Plan for next week', exact: true }).click()
  const nextMonday = nextMondayYmd()
  const [, m, d] = nextMonday.split('-').map(Number)
  // On a Sunday next Monday IS tomorrow, and "Tomorrow" is still the app saying which day it
  // understood. What this test is about is that the WIRE FORMAT never reaches the screen.
  const echo = nextMonday === dayOffset(1) ? 'Tomorrow' : `${MONTHS[m! - 1]} ${d}`
  await expect(dialog.getByText(echo, { exact: true })).toBeVisible()
  // The wire format never reaches the screen as a reading.
  await expect(dialog.getByText(/^\d{4}-\d{2}-\d{2}$/)).toHaveCount(0)
})

test('the pane wears the row system: two date glyphs, two colour families', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '两种日期')
  await openPane(page, pid, '两种日期')

  const dialog = page.getByRole('dialog', { name: 'Task details' })
  const due = dialog.locator('label[for="detail-due"]')
  const plan = dialog.locator('label[for="detail-plan"]')
  await expect(due).toHaveText('Due')
  await expect(plan).toHaveText('Plan')

  // Cool against warm, and they are the ROW's two tokens, not two more colours invented here.
  const colours = await page.evaluate(() => {
    const probe = document.createElement('span')
    document.body.append(probe)
    const read = (token: string) => {
      probe.style.color = `var(${token})`
      return getComputedStyle(probe).color
    }
    const out = { deadline: read('--color-deadline'), plan: read('--color-plan') }
    probe.remove()
    return out
  })
  expect(await due.evaluate((el) => getComputedStyle(el).color)).toBe(colours.deadline)
  expect(await plan.evaluate((el) => getComputedStyle(el).color)).toBe(colours.plan)
  expect(colours.deadline).not.toBe(colours.plan)

  // ...and they differ in SILHOUETTE, not only in hue: the flag is upright, the plan tick is wide.
  // Measured on drawn ink, so a copied path or a recoloured twin fails.
  const ink = async (label: typeof due) =>
    label.locator('svg').evaluate((svg) => {
      const b = (svg as SVGSVGElement).getBBox()
      return { w: b.width, h: b.height }
    })
  const dueInk = await ink(due)
  const planInk = await ink(plan)
  expect(dueInk.h, 'the deadline flag is taller than it is wide').toBeGreaterThan(dueInk.w)
  expect(planInk.w, 'the plan tick is wider than it is tall').toBeGreaterThan(planInk.h)
})

test('the status chip wears the app’s focus ring when the keyboard reaches it', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '看焦点')
  await openPane(page, pid, '看焦点')

  // The radio itself is a transparent overlay, so the ring the app draws on every other control
  // has to be drawn on the CHIP. Without this the one control added in this stage would be the
  // one control a keyboard user cannot see (section 7: a visible ring on every control).
  await page.getByRole('textbox', { name: 'Title' }).focus()
  await page.keyboard.press('Tab')
  const chip = page.getByRole('radio', { name: 'To do', exact: true }).locator('xpath=..')
  const ring = await chip.evaluate((el) => {
    const s = getComputedStyle(el)
    return { width: s.outlineWidth, style: s.outlineStyle, color: s.outlineColor }
  })
  const accent = await page.evaluate(() => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--color-accent)'
    document.body.append(probe)
    const c = getComputedStyle(probe).color
    probe.remove()
    return c
  })
  expect(ring.style).toBe('solid')
  expect(parseFloat(ring.width)).toBeGreaterThanOrEqual(2)
  expect(ring.color).toBe(accent)
})

// -------------------------------------------------------------------------- rank and the task

test('the pane opens with the task, and Delete is not a peer of Save', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Workbench')
  await makeTask(page, pid, '这条任务的标题')
  await openPane(page, pid, '这条任务的标题')
  const dialog = page.getByRole('dialog', { name: 'Task details' })

  // The first thing in the pane is where the task lives and what it is called -- not a field
  // label over an input. The project is NAMED (the chip beside it is never the only carrier).
  const title = dialog.getByRole('textbox', { name: 'Title' })
  await expect(title).toHaveValue('这条任务的标题')
  // The project is NAMED on screen, not only coloured: the chip beside it is a second channel.
  // The picker is the app's own now -- a button that is both the label and the value -- so the
  // name is its accessible name and its text, and there are no options to read.
  const picker = dialog.getByRole('button', { name: /^Projects/ })
  await expect(picker).toHaveAccessibleName('Projects: Workbench')
  await expect(picker).toHaveText('Workbench')
  const titleSize = await title.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  const notesSize = await dialog
    .getByLabel('Notes', { exact: true })
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  expect(titleSize, 'the title is the biggest text in the pane').toBeGreaterThan(notesSize)

  // 删除不和 Save 同处一张表：它在阅读态的最底下，而这里是编辑态。
  await expect(dialog.getByRole('button', { name: 'Delete task' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Cancel' }).click()

  const save = dialog.getByRole('button', { name: 'Save' })
  const del = dialog.getByRole('button', { name: 'Delete task' })
  await expect(del).toBeVisible()
  await expect(save).toHaveCount(0)
  // 它是这个面里最后一个东西，而且穿的是别处没有的那个颜色。
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
})

test('the pane opens in reading mode with no field, and Edit reveals them', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '只读')
  const id = await makeTask(page, pid, '读一下这条任务', {
    status: 'in_progress',
    dueAt: `${dayOffset(2)}T09:15:00.000Z`,
    scheduledOn: dayOffset(1),
    notes: '第一行\n第二行',
  })
  const writes: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'PATCH' || r.method() === 'DELETE') writes.push(r.url())
  })

  await openPane(page, pid, '读一下这条任务', false)
  const dialog = page.getByRole('dialog', { name: 'Task details' })

  // Not one FIELD on screen: no input of any kind, no select, no textarea, and nothing exposed as
  // a textbox / radio / checkbox / combobox either.
  const controls = await dialog.locator('input, select, textarea, [contenteditable]').count()
  expect(controls, 'editable controls in reading mode').toBe(0)
  for (const role of ['textbox', 'radio', 'checkbox', 'combobox', 'spinbutton', 'slider'] as const)
    await expect(dialog.getByRole(role), role).toHaveCount(0)
  // 毁掉这条任务的动作在阅读态的最底下 —— 和删一个人、取消一场会同一个位置。删除不是编辑的
  // 同侪，逼人先按 Edit 才能删是分类错误；它靠距离和一次确认来保护，不靠藏起来。
  await expect(dialog.getByRole('button', { name: 'Delete task' })).toBeVisible()
  // And the information is all there, which is the other half: nothing is behind a second menu.
  await expect(dialog.locator('[data-detail-title]')).toHaveText('读一下这条任务')
  await expect(dialog).toContainText('In progress')
  await expect(dialog).toContainText('只读')
  await expect(dialog.locator('[data-detail-notes]')).toContainText('第二行')
  // Said in the app's own words, never the wire format a reader would have to parse.
  await expect(dialog.getByText(/^\d{4}-\d{2}-\d{2}/)).toHaveCount(0)
  await expect(dialog).toContainText('Tomorrow')

  // Edit brings every one of them back.
  await editDetail(page)
  await expect(dialog.getByRole('textbox', { name: 'Title' })).toHaveValue('读一下这条任务')
  await expect(dialog.getByRole('radio', { name: 'In progress', exact: true })).toBeChecked()
  await expect(dialog.getByLabel('Plan', { exact: true })).toHaveValue(dayOffset(1))
  await expect(dialog.getByLabel('Notes', { exact: true })).toHaveValue('第一行\n第二行')
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeVisible()
  // 正在改的那张表上不画删除：一张表的两个出口是 Save 和 Cancel。
  await expect(dialog.getByRole('button', { name: 'Delete task' })).toHaveCount(0)

  // Reading and then choosing to edit wrote nothing on its own: this is not autosave with a
  // read-only skin on it.
  await page.waitForTimeout(200)
  expect(writes, 'nothing was written by reading or by pressing 编辑').toEqual([])
  expect((await serverTask(page, pid, id)).status).toBe('in_progress')
})

test('Edit hands focus to the first field rather than dropping it on the body', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '按下编辑')
  await openPane(page, pid, '按下编辑', false)
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

  await openPane(page, pid, '改我的状态', false)
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

test('picking the status it already has writes nothing', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Status')
  await makeTask(page, pid, '不改我的状态')
  const writes: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'PATCH') writes.push(r.url())
  })

  await openPane(page, pid, '不改我的状态', false)
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

  await openPane(page, pid, '改完就走', false)
  await page.getByRole('dialog').getByRole('button', { name: 'Status: To do' }).click()
  await page.getByRole('menuitem', { name: 'Done' }).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Status: Done' })).toBeVisible()

  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Today' })
    .click()
  await expect(page).toHaveURL(/\/tasks\/today$/)
  await expect(page.getByRole('button', { name: 'Keep editing' })).toHaveCount(0)
})
