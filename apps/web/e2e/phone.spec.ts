import { expect, test, type Page } from '@playwright/test'
import {
  accountZone,
  apiPost,
  dayInZone,
  makeProject,
  makeReading,
  makeTask,
  registerFreshUser,
  WEB,
} from './helpers'
import { addDays } from '@ctws/core/day'

/**
 * THE PHONE (FR-082 to FR-085, artboard 25): the tab bar's capture sheet, Today in sections with
 * its swipes, and More. At 390, the artboards' width.
 */
const PHONE = { width: 390, height: 844 }
test.use({ viewport: PHONE, hasTouch: true })

const tabs = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' })

const serverTasks = async (page: Page, projectId: string) =>
  (
    (await (
      await page.request.get(`/api/v1/tasks?projectId=${projectId}`, { headers: WEB })
    ).json()) as {
      tasks: {
        id: string
        title: string
        parentId: string | null
        status: string
        scheduledOn: string | null
      }[]
    }
  ).tasks

test('the capture sheet: a link turns it to Reading, Add keeps it open and empty (FR-084)', async ({
  page,
}) => {
  await registerFreshUser(page)
  await tabs(page).getByRole('button', { name: 'Capture' }).click()
  const sheet = page.getByRole('dialog', { name: 'Capture' })
  const box = sheet.getByRole('textbox', { name: 'Capture' })
  await expect(box).toBeFocused()
  // Every control is at least 44 to touch (FR-082, BUG-066).
  for (const control of await sheet.getByRole('button').all()) {
    const size = (await control.boundingBox())!
    const name = (await control.getAttribute('aria-label')) ?? (await control.innerText())
    expect(Math.min(size.width, size.height), name).toBeGreaterThanOrEqual(44)
  }
  for (const control of await sheet.getByRole('radio').all())
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)

  await box.fill('https://martinfowler.com/articles/patterns')
  await expect(sheet.getByRole('radio', { name: 'Reading' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  // Event is a placeholder: pressed, it only says so.
  await sheet.getByRole('radio', { name: 'Event' }).click()
  await expect(sheet.getByRole('status').filter({ hasText: 'Coming later' })).toBeVisible()

  await box.fill('Call the letting agent')
  await expect(sheet.getByRole('radio', { name: 'Task' })).toHaveAttribute('aria-checked', 'true')
  await sheet.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(sheet.getByRole('status').filter({ hasText: 'Added to' })).toBeVisible()
  await expect(box).toHaveValue('')
  await expect(sheet).toBeVisible()
})

test('Lands in is Move to…, Inbox first, and a project’s parents a step in (FR-084)', async ({
  page,
}) => {
  await registerFreshUser(page)
  const jh = await makeProject(page, 'Job hunt')
  const amazon = await makeTask(page, jh, 'Amazon')
  await makeTask(page, jh, 'Phone screen', {}, amazon)
  await page.reload()
  await tabs(page).getByRole('button', { name: 'Capture' }).click()
  const sheet = page.getByRole('dialog', { name: 'Capture' })
  await sheet.getByRole('textbox', { name: 'Capture' }).fill('Ask about the team')

  await sheet.getByRole('button', { name: /^Lands in/ }).click()
  const picker = page.getByRole('dialog', { name: 'Lands in' })
  await expect(picker.getByRole('option').first()).toContainText('Inbox')
  await picker.getByRole('button', { name: 'Inside “Job hunt”' }).click()
  // A full screen shuts with its ×, the way back beside it.
  await expect(picker.getByRole('button', { name: 'Close' })).toBeVisible()
  await picker.getByRole('option', { name: /Amazon/ }).click()
  await expect(sheet.getByRole('button', { name: 'Lands in Job hunt, under Amazon' })).toBeVisible()

  await sheet.getByRole('button', { name: 'No date' }).click()
  const day = page.getByRole('dialog', { name: 'Day' })
  const today = dayInZone(await accountZone(page))
  await day.getByRole('button', { name: today, exact: true }).click()
  await expect(sheet.getByRole('button', { name: 'On Today' })).toBeVisible()

  await sheet.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(sheet.getByRole('status').filter({ hasText: 'Added to' })).toBeVisible()
  const made = (await serverTasks(page, jh)).find((t) => t.title === 'Ask about the team')!
  expect([made.parentId, made.scheduledOn]).toEqual([amazon, today])
})

test('Today on a phone: sections, the circle finishes, the swipes move and finish (FR-083)', async ({
  page,
}) => {
  await registerFreshUser(page)
  const today = dayInZone(await accountZone(page))
  const p = await makeProject(page, 'Moving flat')
  for (const title of ['Measure the room', 'Book the van', 'Pack the books', 'Call the agent'])
    await makeTask(page, p, title, { scheduledOn: today })
  await makeTask(page, p, 'Return the keys', { dueAt: `${addDays(today, -3)}T12:00:00.000Z` })
  await page.reload()

  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
  const planned = page.getByRole('region', { name: 'Planned for today' })
  await expect(planned.locator('[data-phone-row]')).toHaveCount(4)
  await expect(page.getByRole('region', { name: 'Overdue' })).toContainText('3 days late')
  // Nothing of the desk's: no timeline, no Ready to start.
  await expect(page.getByRole('region', { name: 'Ready to start' })).toHaveCount(0)

  // The circle, at least 44 to touch, finishes it.
  const circle = planned.getByRole('button', { name: 'Done “Measure the room”' })
  expect((await circle.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await circle.click()
  await expect(planned.getByText('Measure the room')).toHaveCount(0)

  // Swiped left: Tomorrow takes it off today.
  const swipe = async (title: string, by: number) => {
    const row = page.locator('[data-phone-row]').filter({ hasText: title }).locator('.touch-pan-y')
    const b = (await row.boundingBox())!
    const y = b.y + b.height / 2
    const from = by < 0 ? b.x + b.width - 40 : b.x + 60
    await page.mouse.move(from, y)
    await page.mouse.down()
    for (let i = 1; i <= 10; i++) await page.mouse.move(from + (by * i) / 10, y)
    await page.mouse.up()
  }
  await swipe('Book the van', -200)
  await planned.getByRole('button', { name: 'Move “Book the van” to tomorrow' }).click()
  await expect(planned.getByText('Book the van')).toHaveCount(0)
  expect((await serverTasks(page, p)).find((t) => t.title === 'Book the van')!.scheduledOn).toBe(
    addDays(today, 1),
  )

  // Pick a date: the shared grid from the foot; a day not today takes it off.
  await swipe('Pack the books', -200)
  await planned.getByRole('button', { name: 'Pick a date for “Pack the books”' }).click()
  const sheet = page.getByRole('dialog', { name: 'Move to' })
  await expect(sheet).toContainText('Pack the books')
  await sheet.getByRole('button', { name: 'Next month' }).click()
  await sheet.getByRole('button', { name: /-15$/ }).first().click()
  await expect(planned.getByText('Pack the books')).toHaveCount(0)

  // Swiped right: done.
  await swipe('Call the agent', 160)
  await expect(planned).toHaveCount(0)
  expect((await serverTasks(page, p)).find((t) => t.title === 'Call the agent')!.status).toBe(
    'done',
  )
})

test('More: search on top, the pages, every other kind, the projects, the account (FR-085)', async ({
  page,
}) => {
  await registerFreshUser(page)
  const p = await makeProject(page, 'Moving flat')
  await makeTask(page, p, 'Book the van')
  await makeTask(page, p, 'Pack')
  const priya = await apiPost(page, '/people', { givenName: 'Priya', familyName: 'Nair' })
  await apiPost(page, '/communication', {
    direction: 'sent',
    channel: 'email',
    subject: 'Referral',
    parties: [{ type: 'person', id: priya.id as string }],
    awaitingReply: true,
  })
  await tabs(page).getByRole('link', { name: 'More' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible()
  const main = page.getByRole('main')
  await expect(main.getByRole('region', { name: 'Pages' }).getByRole('link')).toHaveText([
    /^Workbench/,
    /^Review/,
  ])
  const kinds = main.getByRole('region', { name: 'Everything else' }).getByRole('link')
  await expect(kinds).toHaveText([
    /^Projects/,
    /^Organisations/,
    /^Meetings/,
    /^Communication\s*Awaiting\s*1/,
    /^Reading/,
    /^Notes/,
  ])
  await expect(main.getByRole('region', { name: 'Projects' }).getByRole('link')).toHaveText([
    /^MF\s*Moving flat\s*2/,
  ])
  await main.getByRole('button', { name: 'Search everything' }).click()
  await expect(page.getByRole('dialog', { name: 'Search everything' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await main.getByRole('link', { name: 'Account and time zone' }).click()
  await expect(page).toHaveURL(/\/account$/)
})

test('the phone calendar: lunar names, a dot a kind, the chosen day listed (FR-086)', async ({
  page,
}) => {
  await registerFreshUser(page)
  await apiPost(page, '/meetings', {
    title: 'Stripe: first screen',
    startsLocal: '2026-10-22T14:00',
    timeZone: await accountZone(page),
    durationMinutes: 45,
    joinUrl: 'https://meet.google.com/abc-defg-hij',
  })
  const p = await makeProject(page, 'Job hunt')
  await makeTask(page, p, 'Prepare the system design round', { dueAt: '2026-10-22T16:00:00.000Z' })
  await page.goto('/calendar?day=2026-10-18')

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^October/)
  await expect(page.locator('[data-day="2026-10-18"]')).toContainText('重阳')
  await expect(page.locator('[data-day="2026-10-22"] .bg-meeting')).toHaveCount(1)
  await expect(page.locator('[data-day="2026-10-22"] .bg-warn')).toHaveCount(1)

  await page.locator('[data-day="2026-10-22"]').click()
  const day = page.getByRole('region', { name: 'Thursday, October 22' })
  await expect(day.locator('[data-day-entry]')).toHaveText([
    /14:00\s*14:45\s*Stripe: first screen\s*Google Meet/,
    /Due\s*Prepare the system design round/,
  ])
  await day.getByRole('link', { name: /Stripe: first screen/ }).click()
  await expect(page.getByRole('link', { name: /Join/ }).first()).toBeVisible()
  // A thing's page has its way back to its kind's list (FR-082).
  await page.getByRole('main').getByRole('link', { name: 'Meetings', exact: true }).click()
  await expect(page).toHaveURL(/\/meetings$/)

  // New event is a placeholder: it says so and opens nothing.
  await page.goto('/calendar')
  await page.getByRole('button', { name: 'New event' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Coming later' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('a person on a phone: a tap to reach them, their clock, the rest under More about (FR-087)', async ({
  page,
}) => {
  // Their clock against yours on a day of their summer time and ours.
  await page.clock.setFixedTime(new Date('2026-10-18T09:24:00Z'))
  await registerFreshUser(page)
  const wang = await apiPost(page, '/people', {
    givenName: '磊',
    familyName: '王',
    city: 'Shanghai, China',
    cityKey: 'shanghai-cn',
    timeZone: 'Asia/Shanghai',
    note: 'Met at the Beijing meetup.',
    channels: [{ kind: 'phone', value: '+86 139 1234 5678', label: null }],
  })
  await page.goto(`/people/${wang.id as string}`)
  await expect(page.getByRole('link', { name: 'People' }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Call' })).toHaveAttribute(
    'href',
    'tel:+8613912345678',
  )
  await expect(page.getByRole('link', { name: 'Message' })).toHaveAttribute(
    'href',
    'sms:+8613912345678',
  )
  // No address to write to: Email is greyed and goes nowhere.
  await expect(page.getByRole('link', { name: 'Email' })).toHaveCount(0)

  const card = page.getByRole('list', { name: 'Profile' })
  await expect(card).toContainText('17:24 in Shanghai')
  await expect(card).toContainText('7 hours ahead of you')
  const more = page.getByRole('region', { name: 'More about 王磊' })
  await expect(more).toContainText('Shanghai, China')
  await expect(more).toContainText('Met at the Beijing meetup.')

  // "…" holds Delete, and only that.
  await page.getByRole('button', { name: 'More', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: '王磊' })
  await expect(sheet.getByRole('button')).toHaveCount(2)
  await expect(sheet.getByRole('button', { name: 'Close' })).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Delete 王磊' })).toBeVisible()
})

test('on a phone the inspector is a sheet over the whole screen: ×, ‹ once deeper, Edit (FR-088)', async ({
  page,
}) => {
  await registerFreshUser(page)
  const today = dayInZone(await accountZone(page))
  const p = await makeProject(page, 'Moving flat')
  const priya = await apiPost(page, '/people', { givenName: 'Priya', familyName: 'Nair' })
  const task = await makeTask(page, p, 'Book the van', { scheduledOn: today })
  await apiPost(page, '/relations', {
    from: { type: 'task', id: task },
    to: { type: 'person', id: priya.id },
  })
  await page.reload()

  await page
    .locator('[data-phone-row]')
    .filter({ hasText: 'Book the van' })
    .getByRole('button', { name: /^Book the van/ })
    .click()
  const sheet = page.getByRole('complementary', { name: 'Inspector' })
  await expect(sheet).toBeVisible()
  // It covers the tab bar: the whole screen but the status bar.
  const box = (await sheet.boundingBox())!
  expect(box.y + box.height).toBeGreaterThanOrEqual(PHONE.height - 1)
  await expect(sheet.getByRole('button', { name: 'Close' })).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(1)
  await expect(sheet.getByRole('button', { name: 'Open full page' })).toHaveCount(0)

  // Something opened in it takes its place, with ‹ back beside ×.
  await sheet
    .locator('[data-linked]')
    .filter({ hasText: 'Priya Nair' })
    .getByText('Priya Nair')
    .click()
  const back = sheet.getByRole('button', { name: /^Back to/ })
  await expect(back).toBeVisible()
  await back.click()
  await expect(back).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(sheet).toHaveCount(0)
})

test('on a phone a delete asks from the foot, its answers across it, Delete first (DES-001)', async ({
  page,
}) => {
  await registerFreshUser(page)
  const mira = await apiPost(page, '/people', { givenName: 'Mira', familyName: 'Chen' })
  await page.goto(`/people/${mira.id as string}`)
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await page.getByRole('button', { name: 'Delete Mira Chen' }).click()
  const ask = page.getByRole('alertdialog', { name: 'Delete Mira Chen' })
  await expect(ask).toContainText('Delete Mira Chen?')
  const answers = ask.getByRole('button')
  await expect(answers).toHaveText(['Delete Mira Chen', 'Cancel'])
  const [first, second] = [
    (await answers.nth(0).boundingBox())!,
    (await answers.nth(1).boundingBox())!,
  ]
  expect(first.y).toBeLessThan(second.y)
  expect(first.width).toBeGreaterThan(PHONE.width - 60)
  await answers.nth(1).click()
  await expect(ask).toHaveCount(0)
})

test('the swipe is only a shortcut: a row’s actions are reached as they are, and in its sheet (FR-083)', async ({
  page,
}) => {
  await registerFreshUser(page)
  const today = dayInZone(await accountZone(page))
  const p = await makeProject(page, 'Moving flat')
  for (const title of ['Book the van', 'Pack the books'])
    await makeTask(page, p, title, { scheduledOn: today })
  await page.reload()
  const planned = page.getByRole('region', { name: 'Planned for today' })

  // Reached by the keyboard or a screen reader, not hidden behind the swipe; reaching it opens the row.
  const later = planned.getByRole('button', { name: 'Move “Book the van” to tomorrow' })
  await later.focus()
  await expect(later).toBeInViewport()
  await later.press('Enter')
  await expect(planned.getByText('Book the van')).toHaveCount(0)

  // In the sheet its name opens: Tomorrow and Pick a date under the plan.
  await planned.getByRole('button', { name: /^Pack the books/ }).click()
  const sheet = page.getByRole('complementary', { name: 'Inspector' })
  await sheet.getByRole('button', { name: 'Move “Pack the books” to tomorrow' }).click()
  await expect
    .poll(
      async () =>
        (await serverTasks(page, p)).find((t) => t.title === 'Pack the books')!.scheduledOn,
    )
    .toBe(addDays(today, 1))
  await expect(
    sheet.getByRole('button', { name: 'Pick a date for “Pack the books”' }),
  ).toBeVisible()
})

test('a project on a phone: its tree alone, a row 44 and over, tags under its name (FR-088)', async ({
  page,
}) => {
  await registerFreshUser(page)
  const jh = await makeProject(page, 'Job hunt')
  const amazon = await makeTask(page, jh, 'Amazon')
  await makeTask(page, jh, 'Phone screen', { dueAt: '2020-01-01T12:00:00.000Z' }, amazon)
  await makeTask(page, jh, 'Onsite', {}, amazon)
  await page.goto(`/projects/${jh}`)

  await expect(page.getByRole('link', { name: 'Projects' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Job hunt' })).toBeVisible()
  // One view: no Tree and Board to switch between.
  await expect(page.getByRole('radio', { name: /Board/ })).toHaveCount(0)
  const rows = page.locator('[data-phone-tree-row]')
  await expect(rows).toHaveCount(3)
  for (const row of await rows.all())
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  // What opens it, not only the row it sits in (BUG-070).
  for (const name of await page.locator('[data-phone-tree-row] button:not([aria-label])').all())
    expect((await name.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await expect(rows.filter({ hasText: 'Amazon' })).toContainText('0/2')
  await expect(rows.filter({ hasText: 'Phone screen' })).toContainText(/\w{3} \d+/)

  // The circle finishes a leaf; the name opens it in the sheet.
  await page.getByRole('button', { name: 'Done “Onsite”' }).click()
  await expect(rows.filter({ hasText: 'Onsite' })).toHaveCount(0)
  await rows
    .filter({ hasText: 'Phone screen' })
    .getByRole('button', { name: /^Phone screen/ })
    .click()
  await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeVisible()
  await page
    .getByRole('complementary', { name: 'Inspector' })
    .getByRole('button', { name: 'Close' })
    .click()

  // Edit stages is under "…".
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Edit stages' }).click()
  await expect(page.getByRole('dialog', { name: /Stages in Job hunt/ })).toBeVisible()
})

test('a person on a project: Remove is a swipe away, and in their sheet, asked first (DES-001)', async ({
  page,
}) => {
  await registerFreshUser(page)
  const jh = await makeProject(page, 'Job hunt')
  for (const [given, family] of [
    ['Mira', 'Chen'],
    ['Priya', 'Nair'],
  ])
    await apiPost(page, '/people', { givenName: given, familyName: family, projectIds: [jh] })
  await page.goto(`/projects/${jh}`)
  const people = page.getByRole('region', { name: 'People' })
  await expect(people.locator('[data-linked]')).toHaveCount(2)
  for (const row of await people.locator('[data-linked]').all())
    expect((await row.boundingBox())!.height, 'a linked row (BUG-070)').toBeGreaterThanOrEqual(44)

  // Reached as it is, without the swipe: reaching it opens the row.
  const remove = people.getByRole('button', { name: 'Remove Mira Chen from project' })
  await remove.focus()
  await expect(remove).toBeInViewport()
  expect(
    (await remove.boundingBox())!.height,
    'the swiped Remove (BUG-070)',
  ).toBeGreaterThanOrEqual(44)
  await remove.press('Enter')
  await expect(people.locator('[data-linked]')).toHaveCount(1)

  // Opened from the block, the sheet offers it at its foot, and asks first.
  await people.getByText('Priya Nair').click()
  const sheet = page.getByRole('complementary', { name: 'Inspector' })
  await sheet.getByRole('button', { name: 'Remove from Job hunt' }).click()
  const ask = page.getByRole('alertdialog', { name: 'Remove Priya Nair from Job hunt' })
  await ask.getByRole('button', { name: 'Remove from Job hunt' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(people.locator('[data-linked]')).toHaveCount(0)
})

test('a mention clicked in the sheet takes its place, ‹ back to what mentioned it (BUG-069)', async ({
  page,
}) => {
  await registerFreshUser(page)
  const today = dayInZone(await accountZone(page))
  const mira = await apiPost(page, '/people', { givenName: 'Mira', familyName: 'Chen' })
  const p = await makeProject(page, 'Job hunt')
  await makeTask(page, p, 'Prepare the round', {
    scheduledOn: today,
    notes: `Ask [@Mira Chen](ctws://person/${mira.id as string}) which questions came up.`,
  })
  await page.reload()
  await page
    .locator('[data-phone-row]')
    .filter({ hasText: 'Prepare the round' })
    .getByRole('button', { name: /^Prepare the round/ })
    .click()
  const sheet = page.getByRole('complementary', { name: 'Inspector' })
  await sheet.locator('[data-mention="person"]').click()
  await expect(page).toHaveURL(/inspect=person/)
  await sheet.getByRole('button', { name: /^Back to/ }).click()
  await expect(page).toHaveURL(/inspect=task/)
})

test('a repeating meeting asks "Change which?" from the foot, Edit over Cancel (DES-001)', async ({
  page,
}) => {
  await registerFreshUser(page)
  const day = addDays(dayInZone(await accountZone(page)), 1)
  const made = await apiPost<{ meetingId: string }>(page, '/meetings', {
    title: 'Standup',
    startsLocal: `${day}T09:30`,
    timeZone: await accountZone(page),
    durationMinutes: 30,
    rrule: 'FREQ=DAILY',
  })
  await page.goto(`/meetings/${made.meetingId}?at=${day}T09:30`)
  await page.getByRole('main').getByRole('button', { name: 'Edit', exact: true }).click()
  const ask = page.getByRole('dialog', { name: 'This meeting repeats. Change which?' })
  const edit = ask.getByRole('button', { name: 'Edit', exact: true })
  const cancel = ask.getByRole('button', { name: 'Cancel', exact: true })
  const [e, c] = [(await edit.boundingBox())!, (await cancel.boundingBox())!]
  // One over the other, each the sheet's width.
  expect(e.y).toBeLessThan(c.y)
  expect(e.width).toBe(c.width)
  expect(e.width).toBeGreaterThan(PHONE.width - 48)
  await ask.getByRole('radio', { name: /The whole series/ }).check()
  await edit.click()
  await expect(page).toHaveURL(/\/edit/)
})

test('offline, a tap on the greyed Save says why from the foot (FR-033, DES-001)', async ({
  page,
}) => {
  await registerFreshUser(page)
  const id = await makeReading(page, { kind: 'book', title: 'Dune' })
  await page.goto(`/reading/${id}/edit`)
  const bar = page.locator('[data-phone-form-bar]')
  await expect(bar).toBeVisible()
  await page.context().setOffline(true)
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  const save = bar.getByRole('button', { name: 'Save' })
  await expect(save).toHaveAttribute('aria-disabled', 'true')
  const saved = { patched: false }
  page.on('request', (r) => {
    if (r.method() === 'PATCH') saved.patched = true
  })
  // aria-disabled: a tap the browser still delivers, which the actionability check would refuse.
  await save.click({ force: true })
  await expect(page.getByRole('dialog', { name: 'Not now' })).toContainText(/Nothing can be saved/)
  expect(saved.patched).toBe(false)
  await page.context().setOffline(false)
})

test('a role on a phone is two lines: where and as what with its ×, then from and to (DES-001)', async ({
  page,
}) => {
  await registerFreshUser(page)
  const org = await apiPost<{ id: string }>(page, '/organisations', { name: 'Amazon' })
  const person = await apiPost<{ id: string }>(page, '/people', {
    givenName: 'Mira',
    familyName: 'Chen',
  })
  const put = await page.request.put(`/api/v1/people/${person.id}/roles`, {
    headers: WEB,
    data: { roles: [{ organisationId: org.id, title: 'Recruiter', from: '2024-01' }] },
  })
  expect(put.ok()).toBe(true)
  await page.goto(`/people/${person.id}/edit`)
  const role = page.getByRole('textbox', { name: 'Role 1', exact: true })
  const remove = page.getByRole('button', { name: 'Remove role 1' })
  const from = page.getByLabel('Role 1 from')
  const [r, x, f] = [
    (await role.boundingBox())!,
    (await remove.boundingBox())!,
    (await from.boundingBox())!,
  ]
  expect(Math.abs(r.y + r.height / 2 - (x.y + x.height / 2))).toBeLessThan(8)
  expect(x.x).toBeGreaterThan(r.x)
  expect(f.y).toBeGreaterThan(r.y + r.height)
})

test('in the edit, Move to… takes a project, then a parent, saved with the rest (FR-088)', async ({
  page,
}) => {
  await registerFreshUser(page)
  const today = dayInZone(await accountZone(page))
  const inbox = await makeProject(page, 'Errands')
  const jh = await makeProject(page, 'Job hunt')
  const amazon = await makeTask(page, jh, 'Amazon')
  await makeTask(page, jh, 'Onsite', {}, amazon)
  const loose = await makeTask(page, inbox, 'Send the thank-you', { scheduledOn: today })
  await page.reload()
  await page
    .locator('[data-phone-row]')
    .filter({ hasText: 'Send the thank-you' })
    .getByRole('button', { name: /^Send the thank-you/ })
    .click()
  const sheet = page.getByRole('complementary', { name: 'Inspector' })
  await sheet.getByRole('button', { name: 'Edit', exact: true }).click()
  await sheet.getByRole('button', { name: /Move to…/ }).click()
  const picker = page.getByRole('dialog', { name: /^Move “Send the thank-you” to/ })
  await picker.getByRole('button', { name: 'Inside “Job hunt”' }).click()
  await picker.getByRole('option', { name: /Amazon/ }).click()
  await expect(sheet.getByRole('button', { name: /Move to…/ })).toContainText('Job hunt › Amazon')
  await sheet.getByRole('button', { name: 'Save', exact: true }).click()
  await expect
    .poll(async () => (await serverTasks(page, jh)).find((t) => t.id === loose)?.parentId)
    .toBe(amazon)
})
