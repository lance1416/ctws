import { expect, test, type Page } from '@playwright/test'
import { registerFreshUser } from './helpers'

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
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dayOffset = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return ymd(d)
}
const nextMondayYmd = () => {
  const d = new Date()
  d.setDate(d.getDate() + (d.getDay() === 0 ? 1 : 8 - d.getDay()))
  return ymd(d)
}

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
async function saveBody(page: Page): Promise<Record<string, unknown>> {
  const done = page.waitForResponse((r) => isPatch(r) && r.ok())
  await page.getByRole('button', { name: '保存' }).click()
  const res = await done
  return res.request().postDataJSON() as Record<string, unknown>
}

async function openPane(page: Page, projectId: string, title: string) {
  await page.goto(`/projects/${projectId}`)
  await page.getByRole('listitem').filter({ hasText: title }).first().click()
  await expect(page.getByRole('dialog', { name: '任务详情' })).toBeVisible()
}

// ------------------------------------------------------------------- status, as shapes not words

test('the status markers write exactly what the status dropdown wrote', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const id = await makeTask(page, pid, '写方案')
  await openPane(page, pid, '写方案')

  // The task starts at 待整理, and the group says so without anything being opened -- which is
  // the whole complaint about the <select> it replaces.
  await expect(page.getByRole('radio', { name: '待整理', exact: true })).toBeChecked()
  for (const name of ['待办', '进行中', '已完成', '已取消']) {
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
  await expect(page.getByRole('radio', { name: '待整理', exact: true })).toBeFocused()

  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: '待办', exact: true })).toBeFocused()
  await expect(page.getByRole('radio', { name: '待办', exact: true })).toBeChecked()

  // One more Tab LEAVES the group entirely: five statuses cost one tab stop, not five.
  await page.keyboard.press('Tab')
  await expect(page.getByRole('radio', { name: '进行中', exact: true })).not.toBeFocused()
  const inGroup = await page.evaluate(
    () => document.activeElement?.closest('[role="radiogroup"]') !== null,
  )
  expect(inGroup, 'Tab left the status group').toBe(false)

  // The arrow press is a real edit: the pane now guards it like any other.
  expect(await saveBody(page)).toEqual({ status: 'todo' })
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
  await page.getByLabel('截止').fill(`${dayOffset(3)}T09:15`)
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
  await page.getByRole('button', { name: '取消截止', exact: true }).click()
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
  await page.getByLabel('排期').fill(dayOffset(4))
  expect(await saveBody(page)).toEqual({ scheduledOn: dayOffset(4) })

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
  expect((await serverTask(page, pid, id)).status).toBe('backlog')

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
  const chip = page.getByRole('radio', { name: '待整理', exact: true }).locator('xpath=..')
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
    .getByLabel('备注')
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
