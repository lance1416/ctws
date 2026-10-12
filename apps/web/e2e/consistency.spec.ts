import { expect, test, type Locator, type Page } from '@playwright/test'
import { dayOffset } from './days'
import { apiPost, makeProject, makeTask, registerFreshUser } from './helpers'

/**
 * THE SAME THING IN THE SAME PLACE, DRAWN THE SAME WAY.
 *
 * What a UI audit found drifting between surfaces that are meant to be one design: a block whose
 * text sat 8px in from every other label in the pane, the same section in a different place in one
 * of the four panes, and a gap that opened under one panel because of a neighbour's height.
 */

/** Where the WORDS start: the text's own box, not the element's, which may carry padding. */
const textLeft = (l: Locator) =>
  l.evaluate((el) => {
    const r = document.createRange()
    r.selectNodeContents(el.firstChild ?? el)
    return Math.round(r.getBoundingClientRect().left)
  })

async function panes(page: Page) {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'IQBank')
  await makeTask(page, pid, 'Ship the importer', { notes: 'Parse, then validate.' })
  const person = await apiPost(page, '/people', { name: 'Ying Chen', org: 'Acme' })
  const book = await apiPost(page, '/reading', { kind: 'book', title: 'The C book' })
  const meeting = await apiPost(page, '/meetings', {
    title: 'Weekly',
    startsLocal: `${dayOffset(1)}T18:00`,
    timeZone: 'America/Toronto',
    durationMinutes: 60,
    projectId: pid,
  })
  return { pid, person, book, meeting }
}

test('每个面板里，Linked 的字和别的标签左边对齐', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const w = await panes(page)
  const open: [string, () => Promise<unknown>, string][] = [
    [
      'Task details',
      async () => {
        await page.goto(`/projects/${w.pid}`)
        await page.getByRole('listitem').filter({ hasText: 'Ship the importer' }).first().click()
      },
      'Notes',
    ],
    ['Meetings', () => page.goto(`/meetings/${w.meeting.meetingId}`), 'Notes'],
    ['People', () => page.goto(`/people/${w.person.id}`), 'Notes'],
    ['Reading', () => page.goto(`/reading/${w.book.id}`), 'Status'],
  ]
  for (const [name, go, other] of open) {
    await go()
    const pane = page.getByRole('dialog', { name })
    const linked = pane.getByRole('region', { name: 'Linked' })
    await expect(linked.getByRole('button', { name: '+ Link' })).toBeVisible()
    const edge = await textLeft(pane.getByText(other, { exact: true }).first())
    expect(await textLeft(linked.getByText('Linked', { exact: true })), `${name}: heading`).toBe(
      edge,
    )
    expect(await textLeft(linked.getByRole('button', { name: '+ Link' })), `${name}: + Link`).toBe(
      edge,
    )
  }
})

test('任务面板里 Linked 在笔记后面，和别的面板同一个位置', async ({ page }) => {
  const w = await panes(page)
  await page.goto(`/projects/${w.pid}`)
  await page.getByRole('listitem').filter({ hasText: 'Ship the importer' }).first().click()
  const pane = page.getByRole('dialog', { name: 'Task details' })
  const notes = (await pane.locator('[data-detail-notes]').boundingBox())!
  const linked = (await pane.getByRole('region', { name: 'Linked' }).boundingBox())!
  expect(linked.y).toBeGreaterThan(notes.y + notes.height)
})

/** `a` sits to the left of `b` on the same line. */
async function leftOf(a: Locator, b: Locator) {
  // Both read in ONE frame. Two reads can straddle a reflow or a scroll as a dialog settles, and
  // then two buttons on one line are measured six pixels apart.
  const [ra, rb] = await a.evaluate(
    (x, y) => {
      const box = (el: Element) => {
        const r = el.getBoundingClientRect()
        return { x: r.x, y: r.y, width: r.width }
      }
      return [box(x), box(y!)] as const
    },
    await b.elementHandle(),
  )
  expect(Math.abs(ra.y - rb.y), 'on one line').toBeLessThanOrEqual(2)
  expect(ra.x + ra.width).toBeLessThanOrEqual(rb.x)
}

test('四个面板的编辑态：Cancel 在左、Save 在右，都在最上面', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const w = await panes(page)
  const open: [string, () => Promise<unknown>][] = [
    [
      'Task details',
      async () => {
        await page.goto(`/projects/${w.pid}`)
        await page.getByRole('listitem').filter({ hasText: 'Ship the importer' }).first().click()
      },
    ],
    ['Meetings', () => page.goto(`/meetings/${w.meeting.meetingId}`)],
    ['People', () => page.goto(`/people/${w.person.id}`)],
    ['Reading', () => page.goto(`/reading/${w.book.id}`)],
  ]
  for (const [name, go] of open) {
    await go()
    const pane = page.getByRole('dialog', { name })
    await pane.getByRole('button', { name: 'Edit', exact: true }).click()
    const cancel = pane.getByRole('button', { name: 'Cancel', exact: true })
    const save = pane.getByRole('button', { name: 'Save', exact: true })
    await expect(save).toBeVisible()
    await leftOf(cancel, save)
    // At the top: above every field the form has.
    const firstField = pane.locator('input, textarea').first()
    expect((await save.boundingBox())!.y, `${name}: Save above the fields`).toBeLessThan(
      (await firstField.boundingBox())!.y,
    )
    await cancel.click()
  }
})

test('新建对话框：Cancel 在左、Create 在右，靠右边', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const w = await panes(page)
  const dialogs: [string, () => Promise<unknown>][] = [
    [
      'task',
      async () => {
        await page.goto(`/projects/${w.pid}`)
        await page.getByRole('button', { name: /^New…/ }).click()
      },
    ],
    [
      'meeting',
      async () => {
        await page.goto('/meetings')
        await page.getByRole('button', { name: 'New meeting' }).click()
      },
    ],
    [
      'person',
      async () => {
        await page.goto('/people')
        await page.getByRole('button', { name: 'New person' }).click()
      },
    ],
  ]
  for (const [what, go] of dialogs) {
    await go()
    const dialog = page.getByRole('dialog')
    const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true })
    const create = dialog.getByRole('button', { name: 'Create', exact: true })
    await expect(create).toBeVisible()
    await leftOf(cancel, create)
    const box = (await dialog.boundingBox())!
    const c = (await create.boundingBox())!
    expect(box.x + box.width - (c.x + c.width), `${what}: Create at the right edge`).toBeLessThan(
      40,
    )
    await cancel.click()
  }
})

test('删除的提问：Cancel 在左，确认在右', async ({ page }) => {
  const w = await panes(page)
  await page.goto(`/projects/${w.pid}`)
  await page.getByRole('listitem').filter({ hasText: 'Ship the importer' }).first().click()
  const pane = page.getByRole('dialog', { name: 'Task details' })
  await pane.getByRole('button', { name: 'Delete task' }).click()
  const confirm = pane.getByRole('button', { name: 'Confirm delete' })
  await expect(confirm).toBeEnabled()
  await leftOf(pane.getByRole('button', { name: 'Cancel', exact: true }), confirm)
})

/** The computed colour of a token, as `getComputedStyle` reports a fill. */
const token = (page: Page, name: string) =>
  page.evaluate((n) => {
    const probe = document.createElement('div')
    probe.style.backgroundColor = `var(--color-${n})`
    document.body.appendChild(probe)
    const c = getComputedStyle(probe).backgroundColor
    probe.remove()
    return c
  }, name)

const fill = (l: Locator) => l.evaluate((el) => getComputedStyle(el).backgroundColor)

async function meetingIn(page: Page, rrule: string | null) {
  await registerFreshUser(page)
  const m = await apiPost(page, '/meetings', {
    title: 'Weekly',
    // A Monday a week or more out, so a weekly-on-Monday rule and its first day agree.
    startsLocal: `${(() => {
      const d = new Date()
      d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7))
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()}T18:00`,
    timeZone: 'America/Toronto',
    durationMinutes: 60,
    ...(rrule ? { rrule } : {}),
  })
  await page.goto(`/meetings/${m.meetingId}`)
  return page.getByRole('dialog', { name: 'Meetings' })
}

test('取消一场重复的会：和删除同一种提问，答案是红的，退出叫 Keep it', async ({ page }) => {
  const pane = await meetingIn(page, 'FREQ=WEEKLY;BYDAY=MO')
  await pane.getByRole('button', { name: 'Cancel meeting' }).click()
  const ask = pane.getByRole('alertdialog', { name: 'This meeting repeats' })
  await expect(ask).toBeVisible()
  // No box of its own: the pane's plane shows through, as it does behind the delete question.
  expect(await fill(ask)).toBe('rgba(0, 0, 0, 0)')
  const danger = await token(page, 'danger')
  const one = ask.getByRole('button', { name: 'Just this one' })
  const later = ask.getByRole('button', { name: 'This and all later' })
  expect(await fill(one)).toBe(danger)
  expect(await fill(later)).toBe(danger)
  const keep = ask.getByRole('button', { name: 'Keep it' })
  // The way out comes first: to the left on one line, or on the line above when the pair of
  // answers wraps as one (a 22rem pane has no room for all three).
  const [k, o] = [(await keep.boundingBox())!, (await one.boundingBox())!]
  expect(k.y + k.height <= o.y || (Math.abs(k.y - o.y) <= 2 && k.x + k.width <= o.x)).toBe(true)
  await expect(ask.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0)
})

test('取消一场只开一次的会：确认写 Cancel meeting，退出写 Keep it', async ({ page }) => {
  const pane = await meetingIn(page, null)
  await pane.getByRole('button', { name: 'Cancel meeting' }).click()
  const confirm = pane.getByRole('button', { name: 'Cancel meeting' })
  await expect(confirm).toBeEnabled()
  expect(await fill(confirm)).toBe(await token(page, 'danger'))
  await leftOf(pane.getByRole('button', { name: 'Keep it' }), confirm)
  await expect(pane.getByRole('button', { name: 'Confirm delete' })).toHaveCount(0)
})

test('改一场重复的会时，问「哪几次」就在 Save 旁边，不在表单底下', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const pane = await meetingIn(page, 'FREQ=WEEKLY;BYDAY=MO')
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  const title = pane.getByLabel('Title', { exact: true })
  // The time, not the title: a title is the series', and only when and how long are asked about.
  const start = pane.getByLabel('Start', { exact: true })
  await start.fill(`${(await start.inputValue()).slice(0, 11)}19:00`)
  await pane.getByRole('button', { name: 'Save', exact: true }).click()
  const ask = pane.getByRole('alertdialog', { name: 'This meeting repeats' })
  await expect(ask).toBeVisible()
  // Above the form, which starts with the Save that raised it.
  expect((await ask.boundingBox())!.y).toBeLessThan((await title.boundingBox())!.y)
  await expect(ask.getByRole('button', { name: 'Just this one' })).toBeInViewport()
})

test('面板里的日子用 app 自己的写法，不出现 2026-10-19 这种线上格式', async ({ page }) => {
  await registerFreshUser(page)
  const person = await apiPost(page, '/people', {
    name: 'Ying Chen',
    birthday: { calendar: 'solar', year: 1991, month: 10, day: 17 },
  })
  // A day a week or two out, said the way `shortDay` says it (the year only when it is not this one).
  const day = dayOffset(9)
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]
  const said = `${MONTHS[m - 1]} ${d}${y === new Date().getFullYear() ? '' : `, ${y}`}`
  const meeting = await apiPost(page, '/meetings', {
    title: 'Weekly',
    startsLocal: `${day}T18:00`,
    timeZone: 'America/Toronto',
    durationMinutes: 60,
  })
  const wire = /\d{4}-\d{2}-\d{2}/

  await page.goto(`/meetings/${meeting.meetingId}`)
  const mp = page.getByRole('dialog', { name: 'Meetings' })
  await expect(mp).toContainText(`${said}, 18:00 · Toronto`)
  await expect(mp.getByText(wire)).toHaveCount(0)

  await page.goto(`/people/${person.id}`)
  const cp = page.getByRole('dialog', { name: 'People' })
  await expect(cp.getByRole('button', { name: /^Birthday,/ })).toContainText('Oct 17, 1991')
  await expect(cp.getByText(wire)).toHaveCount(0)
  // The form says the same day the same way.
  await cp.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(cp.getByRole('button', { name: /^Birthday,/ })).toContainText('Oct 17, 1991')
})

test('同一种东西一种芯片：读的时候和改的时候一样，项目在每个面板里都是芯片', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'IQBank')
  const person = await apiPost(page, '/people', { name: 'Ying Chen', projectIds: [pid] })
  const meeting = await apiPost(page, '/meetings', {
    title: 'Weekly',
    startsLocal: `${dayOffset(1)}T18:00`,
    timeZone: 'America/Toronto',
    durationMinutes: 60,
    projectId: pid,
    attendeeIds: [person.id],
  })
  const look = (l: Locator) =>
    l.evaluate((el) => {
      const s = getComputedStyle(el)
      return [s.fontSize, s.backgroundColor, s.borderTopWidth, s.height].join(' ')
    })

  await page.goto(`/meetings/${meeting.meetingId}`)
  const mp = page.getByRole('dialog', { name: 'Meetings' })
  const reading = mp.locator('[data-attendees] > *').first()
  await expect(reading).toHaveText('Ying Chen')
  const read = await look(reading)
  // The project, read: a chip too, not bare text.
  expect(await look(mp.getByText('IQBank', { exact: true }).first().locator('..'))).toBe(read)

  await mp.getByRole('button', { name: 'Edit', exact: true }).click()
  const editing = mp.getByRole('button', { name: /^Remove .*Ying Chen/ }).locator('..')
  expect(await look(editing)).toBe(read)

  await page.goto(`/people/${person.id}`)
  const cp = page.getByRole('dialog', { name: 'People' })
  expect(await look(cp.getByText('IQBank', { exact: true }).first().locator('..'))).toBe(read)
})

test('新建任务对话框的状态按字宽排，和面板里一样', async ({ page }) => {
  const w = await panes(page)
  await page.goto(`/projects/${w.pid}`)
  await page.getByRole('button', { name: /^New…/ }).click()
  const group = page.getByRole('dialog').getByRole('radiogroup')
  const widths = await group
    .locator('label')
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)))
  expect(widths).toHaveLength(5)
  expect(new Set(widths).size, 'five chips, five widths: sized to the words').toBeGreaterThan(1)
})

test('Today：右栏再高，Working on 下面也只是一格间距', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await registerFreshUser(page)
  const pid = await makeProject(page, 'IQBank')
  await makeTask(page, pid, 'Review the pricing page', { status: 'in_progress' })
  await makeTask(page, pid, 'Rewrite the CV', { scheduledOn: dayOffset(0) })
  // A tall right column: enough overdue rows to outgrow Working on and Today together.
  for (let i = 0; i < 8; i++)
    await makeTask(page, pid, `Overdue ${i}`, { dueAt: `${dayOffset(-2)}T09:00:00.000Z` })
  await page.goto('/tasks/today')
  const doing = page.getByRole('region', { name: 'Working on' })
  const today = page.getByRole('region', { name: 'Today' })
  const overdue = page.getByRole('region', { name: 'Overdue' })
  await expect(overdue).toContainText('Overdue 7')
  const a = (await doing.boundingBox())!
  const b = (await today.boundingBox())!
  const right = (await overdue.boundingBox())!
  // The premise: the right column really is the taller one.
  expect(right.height).toBeGreaterThan(a.height + 16 + b.height)
  expect(Math.round(b.y - (a.y + a.height))).toBe(16)
})
