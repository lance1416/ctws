import { expect, test, type Page } from '@playwright/test'
import { editDetail, registerFreshUser } from './helpers'
import { dayAfter, dayOffset, nextMondayYmd, ymd } from './days'

/**
 * The detail pane (redesign stage 3).
 *
 * The pane used to be a stack of labelled native form controls: a <select> of words for status,
 * two bare date inputs, 保存 / 关闭 and a 删除任务 of the same rank. It now speaks the row
 * system's own vocabulary -- the five marker shapes, the plan and deadline glyphs, the same named
 * decisions the row's triage control offers -- and keeps an exact field for the days those do not
 * cover.
 *
 * What these guards are for:
 * - A control that LOOKS right and writes nothing, or writes something else, is the exact failure
 *   a redesign makes easy. So every one of them is asserted on the REQUEST BODY, against the
 *   values the controls they replace used to send, and then against a fresh read of the server.
 * - "status is told by shape" and "a plan never looks like a deadline" are claims about drawn
 *   ink, so they are measured, not read off a class name.
 * - "a destructive action is not a peer of 保存" is a claim about rank, so it is measured too.
 */

const HEADERS = { 'x-ctws-client': 'web' }

async function makeProject(page: Page, name: string): Promise<string> {
  const res = await page.request.post('/api/v1/projects', { headers: HEADERS, data: { name } })
  expect(res.ok()).toBeTruthy()
  return ((await res.json()) as { id: string }).id
}

async function makeTask(
  page: Page,
  projectId: string,
  title: string,
  patch: Record<string, unknown> = {},
): Promise<string> {
  const res = await page.request.post('/api/v1/tasks', {
    headers: HEADERS,
    data: { projectId, title, parentId: null },
  })
  expect(res.ok()).toBeTruthy()
  const id = ((await res.json()) as { id: string }).id
  if (Object.keys(patch).length > 0) {
    const p = await page.request.patch(`/api/v1/tasks/${id}`, { headers: HEADERS, data: patch })
    expect(p.ok()).toBeTruthy()
  }
  return id
}

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

/** Presses 保存 and returns the PATCH the press produced, so the BODY can be asserted. */
/** The calendar day after `day`, as a plain date string. */

async function saveBody(page: Page): Promise<Record<string, unknown>> {
  const done = page.waitForResponse((r) => isPatch(r) && r.ok())
  await page.getByRole('button', { name: '保存' }).click()
  const res = await done
  return res.request().postDataJSON() as Record<string, unknown>
}

/**
 * Opens a task's pane. `edit` presses 编辑, because since rows-and-reading §5 the pane opens in
 * READING mode and the controls these tests are about exist only in editing mode. What each control
 * WRITES is asserted exactly as before, on the request body.
 */
async function openPane(page: Page, projectId: string, title: string, edit = true) {
  await page.goto(`/projects/${projectId}`)
  await page.getByRole('listitem').filter({ hasText: title }).first().click()
  await expect(page.getByRole('dialog', { name: '任务详情' })).toBeVisible()
  if (edit) await editDetail(page)
}

// ------------------------------------------------------------------- status, as shapes not words

test('the status markers write exactly what the status dropdown wrote', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const id = await makeTask(page, pid, '写方案')
  await openPane(page, pid, '写方案')

  // The task starts at 待办, and the group says so without anything being opened -- which is
  // the whole complaint about the <select> it replaces.
  await expect(page.getByRole('radio', { name: '待办', exact: true })).toBeChecked()
  for (const name of ['待整理', '进行中', '已完成', '已取消']) {
    await expect(page.getByRole('radio', { name, exact: true })).not.toBeChecked()
  }

  await page.getByRole('radio', { name: '进行中', exact: true }).check()
  // One field, the contract's own value -- not the label, and nothing else dragged along.
  expect(await saveBody(page)).toEqual({ status: 'in_progress' })
  expect((await serverTask(page, pid, id)).status).toBe('in_progress')

  // And back the other way, so this cannot pass by writing one constant.
  await openPane(page, pid, '写方案')
  await expect(page.getByRole('radio', { name: '进行中', exact: true })).toBeChecked()
  await page.getByRole('radio', { name: '已取消', exact: true }).check()
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
  await page.getByRole('textbox', { name: '标题' }).focus()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('radio', { name: '待办', exact: true })).toBeFocused()

  // The group is in the status model's own order (backlog, todo, in_progress, done, cancelled),
  // so one step right of 待办 is 进行中; arrowing also CHECKS, which is the native contract.
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: '进行中', exact: true })).toBeFocused()
  await expect(page.getByRole('radio', { name: '进行中', exact: true })).toBeChecked()

  // One more Tab LEAVES the group entirely: five statuses cost one tab stop, not five.
  await page.keyboard.press('Tab')
  await expect(page.getByRole('radio', { name: '已完成', exact: true })).not.toBeFocused()
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

  await page.getByRole('button', { name: '明天截止', exact: true }).click()
  const body = await saveBody(page)
  expect(Object.keys(body)).toEqual(['dueAt'])
  // A deadline is an instant; what it must get right is the local calendar DAY.
  expect(ymd(new Date(body.dueAt as string))).toBe(dayOffset(1))
  expect(ymd(new Date((await serverTask(page, pid, id)).dueAt!))).toBe(dayOffset(1))

  // 下周 is the same Monday the row's triage control means.
  await openPane(page, pid, '交报告')
  await page.getByRole('button', { name: '下周截止', exact: true }).click()
  expect(ymd(new Date((await saveBody(page)).dueAt as string))).toBe(nextMondayYmd())

  // Moving the day keeps the time of day, exactly as 推迟到明天 does on the row. The time is set
  // through the exact field first, and to something that is NOT the default a new deadline gets:
  // with 23:59 on both sides this assertion would hold however the day was moved.
  await openPane(page, pid, '交报告')
  await page.getByLabel('截止', { exact: true }).fill(`${dayOffset(3)}T09:15`)
  await saveBody(page)
  const kept = (await serverTask(page, pid, id)).dueAt!
  expect(new Date(kept).getHours(), 'the fixture really is not the 23:59 default').toBe(9)
  await openPane(page, pid, '交报告')
  await page.getByRole('button', { name: '今天截止', exact: true }).click()
  const moved = (await saveBody(page)).dueAt as string
  expect(ymd(new Date(moved))).toBe(dayOffset(0))
  expect(new Date(moved).getHours()).toBe(9)
  expect(new Date(moved).getMinutes()).toBe(15)

  // And the way out sends null, not an empty string the contract would reject.
  await openPane(page, pid, '交报告')
  await page.getByRole('button', { name: '清除截止', exact: true }).click()
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

  await page.getByRole('button', { name: '排到明天', exact: true }).click()
  expect(await saveBody(page)).toEqual({ scheduledOn: dayOffset(1) })
  expect((await serverTask(page, pid, id)).scheduledOn).toBe(dayOffset(1))

  // The named decision and the exact field are two ways to the SAME field, not two fields.
  await openPane(page, pid, '改简历')
  await expect(page.getByLabel('排期')).toHaveValue(dayOffset(1))
  // THE DAY AFTER NEXT MONDAY, not a fixed offset. `dayOffset(4)` is next Monday whenever this
  // runs on a Thursday, and then 排到下周 below writes the value already stored -- the form is
  // not dirty, no request is sent, and the test hangs waiting for one. It did, on a Thursday.
  const afterNextMonday = dayAfter(nextMondayYmd())
  await page.getByLabel('排期').fill(afterNextMonday)
  expect(await saveBody(page)).toEqual({ scheduledOn: afterNextMonday })

  await openPane(page, pid, '改简历')
  await page.getByRole('button', { name: '排到下周', exact: true }).click()
  await expect(page.getByLabel('排期')).toHaveValue(nextMondayYmd())
  expect(await saveBody(page)).toEqual({ scheduledOn: nextMondayYmd() })

  await openPane(page, pid, '改简历')
  await page.getByRole('button', { name: '清除排期', exact: true }).click()
  await expect(page.getByLabel('排期')).toHaveValue('')
  expect(await saveBody(page)).toEqual({ scheduledOn: null })
  expect((await serverTask(page, pid, id)).scheduledOn).toBeNull()
})

test('both dates change in one request, and nothing is saved until 保存 is pressed', async ({
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

  await page.getByRole('button', { name: '今天截止', exact: true }).click()
  await page.getByRole('button', { name: '排到明天', exact: true }).click()
  await page.getByRole('radio', { name: '进行中', exact: true }).check()
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

  const dialog = page.getByRole('dialog', { name: '任务详情' })
  await page.getByRole('button', { name: '排到明天', exact: true }).click()
  // A native date input prints its format in the BROWSER'S UI language, which no page can set;
  // the echo is the app saying which day it understood, and it is right whatever the field prints.
  await expect(dialog.getByText('明天', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '排到下周', exact: true }).click()
  const [, m, d] = nextMondayYmd().split('-').map(Number)
  await expect(dialog.getByText(`${m}月${d}日`, { exact: true })).toBeVisible()
  // The wire format never reaches the screen as a reading.
  await expect(dialog.getByText(/^\d{4}-\d{2}-\d{2}$/)).toHaveCount(0)
})

test('the pane wears the row system: two date glyphs, two colour families', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '两种日期')
  await openPane(page, pid, '两种日期')

  const dialog = page.getByRole('dialog', { name: '任务详情' })
  const due = dialog.locator('label[for="detail-due"]')
  const plan = dialog.locator('label[for="detail-plan"]')
  await expect(due).toHaveText('截止')
  await expect(plan).toHaveText('排期')

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
  await page.getByRole('textbox', { name: '标题' }).focus()
  await page.keyboard.press('Tab')
  const chip = page.getByRole('radio', { name: '待办', exact: true }).locator('xpath=..')
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

test('the pane opens with the task, and 删除任务 is not a peer of 保存', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '工作台')
  await makeTask(page, pid, '这条任务的标题')
  await openPane(page, pid, '这条任务的标题')
  const dialog = page.getByRole('dialog', { name: '任务详情' })

  // The first thing in the pane is where the task lives and what it is called -- not a field
  // label over an input. The project is NAMED (the chip beside it is never the only carrier).
  const title = dialog.getByRole('textbox', { name: '标题' })
  await expect(title).toHaveValue('这条任务的标题')
  await expect(dialog.getByLabel('项目')).toHaveValue(pid)
  // The project is NAMED on screen, not only coloured: the chip beside it is a second channel.
  // (A `toContainText` here would pass on an unselected option, so it is the selected one.)
  const shown = await dialog
    .getByLabel('项目')
    .evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.textContent)
  expect(shown).toBe('工作台')
  const titleSize = await title.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  const notesSize = await dialog
    .getByLabel('备注', { exact: true })
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  expect(titleSize, 'the title is the biggest text in the pane').toBeGreaterThan(notesSize)

  const save = dialog.getByRole('button', { name: '保存' })
  const del = dialog.getByRole('button', { name: '删除任务' })
  const saveBox = (await save.boundingBox())!
  const delBox = (await del.boundingBox())!
  // Below, not beside: nothing on the way to 保存 passes over the control that destroys the task.
  expect(delBox.y, '删除任务 is below the save row').toBeGreaterThanOrEqual(
    saveBox.y + saveBox.height,
  )
  const [saveSize, delSize] = await Promise.all([
    save.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    del.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ])
  expect(delSize, '删除任务 is quieter than 保存').toBeLessThan(saveSize)
  // ...and it still asks before it does anything.
  await del.click()
  await expect(page.getByRole('alertdialog', { name: '确认删除任务' })).toBeVisible()
})

// ------------------------------------------------------ reading mode and editing mode (spec §5)

/**
 * The complaint this answers is 「编辑和信息显示在同一个地方，容易误触」 plus 「想要的信息在二层菜单」.
 *
 * It was later narrowed (D78): the mis-click surface is a LIVE FORM, not every control. What the
 * pane must not do at rest is sit there with a title field, five status radios and two date
 * inputs one elbow away; a value you have to open a menu to change is deliberate, and making it
 * cost 编辑-改-保存 turned one decision into a procedure. So the count below is over form controls
 * -- fields -- and the status picker is asserted separately, by its own test, as working without
 * any of them.
 *
 * "There is no field" is NOT provable by asserting that some particular one is absent: a pane that
 * hid the title input while leaving the five status radios live would pass that and keep the whole
 * mis-click surface. So the assertion is over EVERY form control in the dialog, counted, and it is
 * paired with the other half -- that 编辑 brings them all back -- because a pane that never shows a
 * control passes the first half on its own.
 */
test('the pane opens in reading mode with no field, and 编辑 reveals them', async ({ page }) => {
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
  const dialog = page.getByRole('dialog', { name: '任务详情' })

  // Not one FIELD on screen: no input of any kind, no select, no textarea, and nothing exposed as
  // a textbox / radio / checkbox / combobox either.
  const controls = await dialog.locator('input, select, textarea, [contenteditable]').count()
  expect(controls, 'editable controls in reading mode').toBe(0)
  for (const role of ['textbox', 'radio', 'checkbox', 'combobox', 'spinbutton', 'slider'] as const)
    await expect(dialog.getByRole(role), role).toHaveCount(0)
  // Destroying the task is not something to land on while reading either.
  await expect(dialog.getByRole('button', { name: '删除任务' })).toHaveCount(0)
  // And the information is all there -- which is the half 「想要的信息在二层菜单」 is about.
  await expect(dialog.locator('[data-detail-title]')).toHaveText('读一下这条任务')
  await expect(dialog).toContainText('进行中')
  await expect(dialog).toContainText('只读')
  await expect(dialog.locator('[data-detail-notes]')).toContainText('第二行')
  // Said in the app's own words, never the wire format a reader would have to parse.
  await expect(dialog.getByText(/^\d{4}-\d{2}-\d{2}/)).toHaveCount(0)
  await expect(dialog).toContainText('明天')

  // 编辑 brings every one of them back.
  await editDetail(page)
  await expect(dialog.getByRole('textbox', { name: '标题' })).toHaveValue('读一下这条任务')
  await expect(dialog.getByRole('radio', { name: '进行中', exact: true })).toBeChecked()
  await expect(dialog.getByLabel('排期')).toHaveValue(dayOffset(1))
  await expect(dialog.getByLabel('备注', { exact: true })).toHaveValue('第一行\n第二行')
  await expect(dialog.getByRole('button', { name: '保存' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '删除任务' })).toBeVisible()

  // Reading and then choosing to edit wrote nothing on its own: this is not autosave with a
  // read-only skin on it.
  await page.waitForTimeout(200)
  expect(writes, 'nothing was written by reading or by pressing 编辑').toEqual([])
  expect((await serverTask(page, pid, id)).status).toBe('in_progress')
})

test('编辑 hands focus to the first field rather than dropping it on the body', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '按下编辑')
  await openPane(page, pid, '按下编辑', false)
  // The 编辑 button unmounts as it is pressed; focus must not fall to <body> (WCAG 2.4.3).
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '标题' })).toBeFocused()
})

/**
 * THE STATUS IS CHANGED WITHOUT ENTERING THE FORM (D78).
 *
 * 「编辑 item 状态不应该点进编辑，这个编辑-改-保存的流程太繁琐了。」 One value out of five is a
 * decision, not a composition: there is nothing for a 保存 to mean. What is asserted here is the
 * whole of that claim -- it writes, it writes ONCE, the form never opens, and nothing is left
 * unsaved behind it.
 */
test('the status is changed from reading mode, in one act and with no 保存', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '状态')
  const id = await makeTask(page, pid, '改我的状态')
  const writes: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'PATCH') writes.push(r.url())
  })

  await openPane(page, pid, '改我的状态', false)
  const dialog = page.getByRole('dialog', { name: '任务详情' })

  await dialog.getByRole('button', { name: '状态：待办' }).click()
  await page.getByRole('menuitem', { name: '进行中' }).click()

  // The value is on the server, from one request.
  await expect.poll(async () => (await serverTask(page, pid, id)).status).toBe('in_progress')
  expect(writes).toHaveLength(1)
  // The pane is still READING: no form opened behind the menu, and nothing to save.
  await expect(dialog.getByRole('textbox', { name: '标题' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: '保存' })).toHaveCount(0)
  // And the control now says what the status is.
  await expect(dialog.getByRole('button', { name: '状态：进行中' })).toBeVisible()
})

test('picking the status it already has writes nothing', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '状态')
  await makeTask(page, pid, '不改我的状态')
  const writes: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'PATCH') writes.push(r.url())
  })

  await openPane(page, pid, '不改我的状态', false)
  const dialog = page.getByRole('dialog', { name: '任务详情' })
  await dialog.getByRole('button', { name: '状态：待办' }).click()
  await page.getByRole('menuitem', { name: '待办' }).click()

  await expect(dialog.getByRole('button', { name: '状态：待办' })).toBeVisible()
  expect(writes, 'a no-op pick must not write').toEqual([])
})

test('a status changed from the pane leaves nothing unsaved to walk away from', async ({
  page,
}) => {
  // The leave guard exists for a form with typing in it. A write that already landed has nothing
  // to lose, so it must not stop someone navigating away a second later.
  await registerFreshUser(page)
  const pid = await makeProject(page, '状态')
  await makeTask(page, pid, '改完就走')

  await openPane(page, pid, '改完就走', false)
  await page.getByRole('dialog').getByRole('button', { name: '状态：待办' }).click()
  await page.getByRole('menuitem', { name: '已完成' }).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: '状态：已完成' })).toBeVisible()

  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '今天' }).click()
  await expect(page).toHaveURL(/\/tasks\/today$/)
  await expect(page.getByRole('button', { name: '继续编辑' })).toHaveCount(0)
})
