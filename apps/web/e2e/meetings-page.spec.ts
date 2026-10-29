import { expect, test, type Page } from '@playwright/test'
import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'
import { addDaysYmd, dayOffset, weekdayFrom } from './days'
import {
  accountZone,
  apiPost,
  navLink,
  pickOne,
  registerFreshUser,
  WEB,
  fillStart,
} from './helpers'

/**
 * MEETINGS (FR-066, FR-067, FR-068) -- the module's own destination: an overview, a page for each
 * occurrence, and an edit page that reaches as far as was chosen when Edit was pressed.
 *
 * A meeting is MADE here, in one form, rather than by clicking a square on a lens. The answers
 * that turn on what day it is are in meetings.pinned.spec.ts.
 */

const dialog = (page: Page) => page.getByRole('dialog', { name: 'New meeting' })
const title = (page: Page) => page.getByRole('main').getByRole('heading', { level: 1 })
const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Meetings' })
const when = (page: Page) =>
  page.getByRole('complementary', { name: 'Profile' }).getByRole('region', { name: 'When' })

/** `BYDAY`'s code for the weekday `day` falls on. */
const weekdayCode = (day: string) =>
  ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][new Date(`${day}T12:00:00Z`).getUTCDay()]!

/** A meeting on the account's own clock, so the page's times are the times it was made at. */
async function meeting(page: Page, data: Record<string, unknown>) {
  return apiPost<{ meetingId: string; recurrenceId: string }>(page, '/meetings', {
    timeZone: await accountZone(page),
    durationMinutes: 30,
    ...data,
  })
}

/** Every occurrence on `day`, as [title, start]. */
async function heldOn(page: Page, day: string) {
  const res = await page.request.get(`/api/v1/meetings?from=${day}&to=${day}`, { headers: WEB })
  return ((await res.json()) as { meetings: { title: string; startsLocal: string }[] }).meetings
    .map((m) => [m.title, m.startsLocal])
    .sort()
}

/** Presses Edit at the page's head, answering "Change which?" when the meeting repeats. */
async function editFromPage(page: Page, which?: string) {
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Edit', exact: true })
    .or(page.getByRole('main').getByRole('link', { name: 'Edit', exact: true }))
    .click()
  if (which) {
    const ask = page.getByRole('dialog', { name: 'This meeting repeats. Change which?' })
    await ask.getByRole('radio', { name: which }).check()
    await ask.getByRole('button', { name: 'Edit', exact: true }).click()
  }
  await expect(title(page)).toHaveText(/^Edit /)
}

test('the icon bar reaches meetings, and the page says when there are none', async ({ page }) => {
  // Every kind has its place on the icon bar (FR-019); an empty one says so (FR-030).
  await registerFreshUser(page)
  await navLink(page, 'Meetings').click()
  await expect(page).toHaveURL(/\/meetings$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Meetings' })).toBeAttached()
  await expect(page.getByRole('heading', { name: 'No meetings yet' })).toBeVisible()
})

test('a meeting is filled in once: title, time, zone, repeat and the people', async ({ page }) => {
  await registerFreshUser(page)
  const project = await apiPost(page, '/projects', { name: 'Job hunt' })
  const projectId = project.id
  await apiPost(page, '/people', { name: 'Ying Chen' })

  await page.goto('/meetings')
  await page.getByRole('main').getByRole('button', { name: 'New meeting' }).click()

  await dialog(page).getByLabel('Title').fill('Second interview')
  await fillStart(dialog(page), dayOffset(1))
  await dialog(page).getByLabel('Start time').fill('21:00')
  await pickOne(dialog(page), 'Time zone', /Toronto/)
  await pickOne(dialog(page), 'Length', '1.5 h')
  await pickOne(dialog(page), 'Repeats', 'Daily')
  await pickOne(dialog(page), 'Projects', 'Job hunt')
  await dialog(page).getByRole('button', { name: 'Add Attendees' }).click()
  await page.getByRole('menuitem', { name: 'Ying Chen' }).click()

  const made = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/api\/v1\/meetings$/.test(r.url()),
  )
  await dialog(page).getByRole('button', { name: 'Create' }).click()
  const body = (await made).request().postDataJSON() as Record<string, unknown>

  // ONE REQUEST carries the whole meeting, rather than an empty one filled in afterwards.
  expect(body).toMatchObject({
    title: 'Second interview',
    startsLocal: `${dayOffset(1)}T21:00`,
    timeZone: 'America/Toronto',
    durationMinutes: 90,
    rrule: 'FREQ=DAILY',
    projectId,
  })
  expect((body.attendeeIds as string[]).length).toBe(1)

  // And it opens on the page of the thing just made, where its notes are written.
  await expect(dialog(page)).toHaveCount(0)
  await expect(page).toHaveURL(/\/meetings\/[0-9a-f-]{36}\?at=/)
  await expect(title(page)).toHaveText('Second interview')
  await expect(page.getByRole('main')).toContainText('Job hunt')
})

test('a repeating meeting is one row in the sidebar, and its page says how it repeats', async ({
  page,
}) => {
  // A daily standup has twenty-three occurrences in a month. A sidebar that listed them all would
  // BE the standup: it answers which meetings there are, the calendar answers which day.
  await registerFreshUser(page)
  await meeting(page, {
    title: 'Standup',
    startsLocal: `${dayOffset(1)}T09:30`,
    durationMinutes: 15,
    rrule: 'FREQ=DAILY',
  })

  await page.goto('/meetings')
  const coming = sidebar(page).getByRole('region', { name: 'Coming' })
  await expect(coming.locator('[data-meeting-row]')).toHaveCount(1)
  await coming.getByRole('link', { name: /Standup/ }).click()
  // It says that it repeats, in the words the picker offers.
  await expect(title(page)).toHaveText('Standup')
  await expect(page.getByRole('main')).toContainText('Daily')
})

test('a repeat can be given an end date, and the series really stops there', async ({ page }) => {
  await registerFreshUser(page)
  const first = weekdayFrom(2, 7) // a Tuesday
  const last = addDaysYmd(first, 14)
  await page.goto('/meetings')
  await page.getByRole('main').getByRole('button', { name: 'New meeting' }).click()

  const form = dialog(page)
  await form.getByLabel('Title').fill('Weekly sync')
  await fillStart(form, first)
  await form.getByLabel('Start time').fill('09:00')
  await form.getByLabel('Location').fill('https://meet.example.test/abc')
  await pickOne(form, 'Repeats', 'Weekly on Tuesday')
  await form.getByLabel('Ends').fill(last)

  const made = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/api\/v1\/meetings$/.test(r.url()),
  )
  await form.getByRole('button', { name: 'Create' }).click()
  const body = (await made).request().postDataJSON() as { rrule: string; location: string }

  // The end is written in the SAME naive space as the start, at the end of the chosen day.
  expect(body.rrule).toBe(`FREQ=WEEKLY;BYDAY=TU;UNTIL=${last.replaceAll('-', '')}T235959Z`)
  expect(body.location).toBe('https://meet.example.test/abc')

  // And the server agrees: three Tuesdays, not a fourth.
  const got = await page.request.get(`/api/v1/meetings?from=${first}&to=${addDaysYmd(last, 14)}`, {
    headers: WEB,
  })
  const days = ((await got.json()) as { meetings: { recurrenceId: string }[] }).meetings.map((m) =>
    m.recurrenceId.slice(0, 10),
  )
  expect(days).toEqual([first, addDaysYmd(first, 7), last])
})

test('a meeting with a link can be joined from its page; one in a room cannot', async ({
  page,
}) => {
  await registerFreshUser(page)
  const online = await meeting(page, {
    title: 'Standup',
    startsLocal: `${dayOffset(1)}T09:30`,
    location: 'https://meet.example.test/standup',
  })
  const room = await meeting(page, {
    title: 'In the room',
    startsLocal: `${dayOffset(1)}T14:00`,
    location: 'Acme HQ, 3F',
  })

  await page.goto(`/meetings/${online.meetingId}`)
  const join = page.getByRole('main').getByRole('link', { name: 'Join' })
  await expect(join).toHaveAttribute('href', 'https://meet.example.test/standup')

  // A room is not a link. Guessing would send you to a site that may be somebody else's.
  await page.goto(`/meetings/${room.meetingId}`)
  await expect(title(page)).toHaveText('In the room')
  const where = page.getByRole('complementary', { name: 'Profile' }).getByRole('region', {
    name: 'Where',
  })
  await expect(where).toContainText('Acme HQ, 3F')
  await expect(page.getByRole('main').getByRole('link', { name: 'Join' })).toHaveCount(0)
})

test("a meeting opens on a page of its own, at the occurrence's own address", async ({ page }) => {
  await registerFreshUser(page)
  await meeting(page, { title: '周会', startsLocal: `${dayOffset(5)}T09:00` })

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/meetings')
  await sidebar(page).getByRole('link', { name: /周会/ }).click()
  await expect(page).toHaveURL(new RegExp('/meetings/[0-9a-f-]{36}\\?at='))
  await expect(title(page)).toHaveText('周会')
  // A page, not a layer over a list.
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Each fact under its heading: the heading's bottom above the value's top.
  const heading = when(page).getByRole('heading', { name: 'When' })
  const value = when(page).getByText('09:00 to 09:30')
  expect(
    (await heading.boundingBox())!.y + (await heading.boundingBox())!.height,
  ).toBeLessThanOrEqual((await value.boundingBox())!.y + 1)
})

/**
 * THE NEXT SEVEN DAYS ARE ON YOUR CLOCK: the weekday, the time here, the title, and the project
 * the meeting is in -- named on the meeting's own page, so its colour is never alone.
 */
test('the overview lists what is coming on your clock, and a meeting names its project', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await registerFreshUser(page)
  const project = await apiPost(page, '/projects', { name: '找工作' })
  const made = await meeting(page, {
    title: 'Second interview',
    startsLocal: `${dayOffset(1)}T14:00`,
    durationMinutes: 60,
    projectId: project.id,
  })
  await page.goto('/meetings')
  const next = page.getByRole('region', { name: 'The next 7 days' })
  const row = next.locator('[data-next-meeting]').filter({ hasText: 'Second interview' })
  await expect(row).toContainText('14:00')
  await row.click()
  await expect(page).toHaveURL(new RegExp(`/meetings/${made.meetingId}\\?at=`))
  await expect(page.getByRole('main').getByRole('link', { name: '找工作' })).toHaveAttribute(
    'href',
    `/projects/${project.id}`,
  )
})

test('backing out of "Change which?" or the edit page saves nothing', async ({ page }) => {
  await registerFreshUser(page)
  const day = dayOffset(1)
  const made = await meeting(page, {
    title: 'Weekly sync',
    startsLocal: `${day}T09:00`,
    rrule: `FREQ=WEEKLY;BYDAY=${weekdayCode(day)}`,
  })
  const writes: string[] = []
  page.on('request', (r) => {
    if (r.method() !== 'GET') writes.push(`${r.method()} ${new URL(r.url()).pathname}`)
  })
  await page.goto(`/meetings/${made.meetingId}?at=${day}T09:00`)
  await page.getByRole('main').getByRole('button', { name: 'Edit', exact: true }).click()
  const ask = page.getByRole('dialog', { name: 'This meeting repeats. Change which?' })
  await ask.getByRole('button', { name: 'Cancel' }).click()
  await expect(ask).toHaveCount(0)
  await expect(title(page)).toHaveText('Weekly sync')

  await editFromPage(page, 'Only this one')
  await page.getByLabel('Title', { exact: true }).fill('Renamed sync')
  await fillStart(page, day, '10:00')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  // What was typed is asked about first (FR-063's guard), then let go.
  await page.getByRole('button', { name: 'Discard changes' }).click()
  await expect(title(page)).toHaveText('Weekly sync')

  expect(writes).toEqual([])
  expect(await heldOn(page, day)).toEqual([['Weekly sync', `${day}T09:00`]])
})

test('a meeting edit the server refuses stays open and says why', async ({ page }) => {
  await registerFreshUser(page)
  const made = await meeting(page, { title: 'Refused sync', startsLocal: `${dayOffset(1)}T09:00` })
  await page.goto(`/meetings/${made.meetingId}`)
  await editFromPage(page)
  await page.getByLabel('Title', { exact: true }).fill('Refused again')
  await page.route(`**/api/v1/meetings/${made.meetingId}`, (r) =>
    r.request().method() === 'PATCH'
      ? r.fulfill({
          status: 400,
          contentType: 'application/problem+json',
          body: JSON.stringify({
            type: 'about:blank',
            title: 'Bad Request',
            status: 400,
            detail: 'That title is too long',
          }),
        })
      : r.continue(),
  )
  await page.getByRole('button', { name: /^Save/ }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText('That title is too long')
  await expect(page).toHaveURL(new RegExp(`/meetings/${made.meetingId}/edit`))
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Refused again')
})

test('a one-off meeting moved on its edit page opens at its new time', async ({ page }) => {
  await registerFreshUser(page)
  const day = dayOffset(1)
  const made = await meeting(page, { title: 'One-off', startsLocal: `${day}T09:00` })
  await page.goto(`/meetings/${made.meetingId}`)
  await editFromPage(page)
  // A one-off is changed whole: nothing to ask, and nothing said about which.
  await expect(page.getByText(/^Changing:/)).toHaveCount(0)
  await fillStart(page, day, '11:00')
  await page.getByRole('button', { name: /^Save/ }).click()
  await expect(page).toHaveURL(new RegExp(`/meetings/${made.meetingId}\\?at=${day}T11(%3A|:)00`))
  await expect(when(page)).toContainText('11:00 to 11:30')
  await expect(page.getByText(/^This meeting was deleted/)).toHaveCount(0)
})

test('this one and every one after, moved, opens on the new series', async ({ page }) => {
  await registerFreshUser(page)
  const start = dayOffset(-7)
  const made = await meeting(page, {
    title: 'Weekly',
    startsLocal: `${start}T09:00`,
    rrule: `FREQ=WEEKLY;BYDAY=${weekdayCode(start)}`,
  })
  const next = dayOffset(7)
  await page.goto(`/meetings/${made.meetingId}?at=${next}T09:00`)
  await editFromPage(page, 'This one and every one after')
  await expect(page.getByText('Changing: This one and every one after')).toBeVisible()
  await fillStart(page, next, '10:00')
  await page.getByRole('button', { name: /^Save/ }).click()
  await expect(page).toHaveURL(new RegExp(`at=${next}T10(%3A|:)00`))
  await expect(when(page)).toContainText('10:00 to 10:30')
  await expect(page.getByText(/^This meeting was deleted/)).toHaveCount(0)
})

test('an occurrence that ends while it is being edited keeps the edit', async ({ page }) => {
  await registerFreshUser(page)
  const zone = await accountZone(page)
  // Begun ten minutes ago on the account's clock: under way while it is edited, over 25 minutes on.
  const startsLocal = format(new TZDate(Date.now() - 10 * 60_000, zone), "yyyy-MM-dd'T'HH:mm")
  const made = await meeting(page, { title: 'Standup', startsLocal, rrule: 'FREQ=DAILY' })
  await page.clock.install()
  await page.goto(`/meetings/${made.meetingId}?at=${startsLocal}`)
  await editFromPage(page, 'Only this one')
  await page.getByRole('textbox', { name: 'Notes', exact: true }).fill('half a thought')
  // Past its end, the sidebar's row for the series becomes tomorrow's.
  await page.clock.fastForward('25:00')
  await expect(title(page)).toHaveText('Edit Standup')
  await expect(page.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue(
    'half a thought',
  )
})

test('a held Enter on Delete this meeting does not also delete a repeating one', async ({
  page,
}) => {
  await registerFreshUser(page)
  const day = dayOffset(1)
  const made = await meeting(page, {
    title: 'Keep me',
    startsLocal: `${day}T09:00`,
    rrule: `FREQ=WEEKLY;BYDAY=${weekdayCode(day)}`,
  })
  await page.goto(`/meetings/${made.meetingId}/edit?at=${day}T09:00&scope=all`)
  await page.getByRole('button', { name: 'Delete this meeting' }).focus()
  // Key repeat: the second Enter lands on whatever took focus when the question opened.
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/meetings/${made.meetingId}/edit`))
  expect(await heldOn(page, day)).toEqual([['Keep me', `${day}T09:00`]])
})

test('renaming a series keeps the week that was moved on its own', async ({ page }) => {
  await registerFreshUser(page)
  const day = dayOffset(1)
  const later = addDaysYmd(day, 7)
  const made = await meeting(page, {
    title: 'Sync',
    startsLocal: `${day}T09:00`,
    rrule: `FREQ=WEEKLY;BYDAY=${weekdayCode(day)}`,
  })
  const moved = await page.request.patch(
    `/api/v1/meetings/${made.meetingId}/occurrences/${later}T09:00`,
    { headers: WEB, data: { startsLocal: `${later}T15:00` } },
  )
  expect(moved.ok(), await moved.text()).toBe(true)

  await page.goto(`/meetings/${made.meetingId}?at=${day}T09:00`)
  await editFromPage(page, 'The whole series')
  await page.getByLabel('Title', { exact: true }).fill('Sync, renamed')
  await page.getByRole('button', { name: /^Save/ }).click()
  await expect(title(page)).toHaveText('Sync, renamed')

  expect(await heldOn(page, later)).toEqual([['Sync, renamed', `${later}T15:00`]])
})

test('renaming the first half of a split series keeps its moved week and its end', async ({
  page,
}) => {
  await registerFreshUser(page)
  const day = dayOffset(1)
  const moved = addDaysYmd(day, 7)
  const split = addDaysYmd(day, 14)
  const made = await meeting(page, {
    title: 'Sync',
    startsLocal: `${day}T09:00`,
    rrule: `FREQ=WEEKLY;BYDAY=${weekdayCode(day)}`,
  })
  const edit = async (method: 'PATCH' | 'POST', path: string, data: object) => {
    const res = await page.request.fetch(`/api/v1/meetings/${made.meetingId}${path}`, {
      method,
      headers: WEB,
      data,
    })
    expect(res.ok(), await res.text()).toBe(true)
  }
  await edit('PATCH', `/occurrences/${moved}T09:00`, { startsLocal: `${moved}T15:00` })
  await edit('POST', '/successors', { from: `${split}T09:00`, title: 'Sync, later' })

  await page.goto(`/meetings/${made.meetingId}?at=${day}T09:00`)
  await editFromPage(page, 'The whole series')
  await page.getByLabel('Title', { exact: true }).fill('Sync, renamed')
  await page.getByRole('button', { name: /^Save/ }).click()
  await expect(title(page)).toHaveText('Sync, renamed')

  expect(await heldOn(page, moved)).toEqual([['Sync, renamed', `${moved}T15:00`]])
  expect(await heldOn(page, split)).toEqual([['Sync, later', `${split}T09:00`]])
})

test('going from one meeting to another does not leave the first on the page', async ({ page }) => {
  await registerFreshUser(page)
  const day = dayOffset(1)
  const far = addDaysYmd(day, 60)
  const alpha = await meeting(page, { title: 'Alpha', startsLocal: `${day}T09:00` })
  const bravo = await meeting(page, { title: 'Bravo', startsLocal: `${far}T09:00` })
  await page.goto(`/meetings/${alpha.meetingId}`)
  await expect(title(page)).toHaveText('Alpha')

  // Hold the read of Bravo's occurrence.
  let release = () => {}
  const held = new Promise<void>((r) => (release = r))
  await page.route(
    (url) => url.pathname.startsWith(`/api/v1/meetings/${bravo.meetingId}/occurrences/`),
    async (route) => {
      await held
      await route.continue()
    },
  )
  await page.evaluate((to) => {
    history.pushState(null, '', to)
    dispatchEvent(new PopStateEvent('popstate'))
  }, `/meetings/${bravo.meetingId}?at=${far}T09:00`)
  await expect(page).toHaveURL(new RegExp(`/meetings/${bravo.meetingId}`))
  await expect(page.getByRole('main').getByRole('heading', { name: 'Alpha' })).toHaveCount(0)
  release()
  await expect(title(page)).toHaveText('Bravo')
})

test('a meeting with no start cannot be saved', async ({ page }) => {
  await registerFreshUser(page)
  const made = await meeting(page, { title: 'Somewhen', startsLocal: `${dayOffset(1)}T09:00` })
  await page.goto(`/meetings/${made.meetingId}`)
  await editFromPage(page)
  // A day always stays in the picker; a start with no time is no start.
  await page.getByLabel('Start time').fill('')
  await expect(page.getByRole('button', { name: /^Save/ })).toBeDisabled()
})

test('this one and every one after is one write, and leaves the earlier ones as they were', async ({
  page,
}) => {
  await registerFreshUser(page)
  const start = dayOffset(-7)
  const made = await meeting(page, {
    title: 'Weekly',
    startsLocal: `${start}T09:00`,
    rrule: `FREQ=WEEKLY;BYDAY=${weekdayCode(start)}`,
  })
  const later = dayOffset(7)
  await page.goto(`/meetings/${made.meetingId}?at=${later}T09:00`)
  await editFromPage(page, 'This one and every one after')
  const writes: string[] = []
  page.on('request', (r) => {
    if (r.method() !== 'GET') writes.push(`${r.method()} ${new URL(r.url()).pathname}`)
  })
  await page.getByLabel('Title', { exact: true }).fill('Weekly, later')
  await fillStart(page, later, '10:00')
  await page.getByRole('button', { name: /^Save/ }).click()
  await expect(page).not.toHaveURL(/\/edit/)

  expect(writes).toEqual([`POST /api/v1/meetings/${made.meetingId}/successors`])
  const first = await page.request.get(
    `/api/v1/meetings/${made.meetingId}/occurrences/${start}T09:00`,
    { headers: WEB },
  )
  expect(((await first.json()) as { title: string }).title).toBe('Weekly')
  // And the page is on the new series' first.
  await expect(title(page)).toHaveText('Weekly, later')
})

test('a task made from a meeting is under Tasks from these meetings', async ({ page }) => {
  // FR-067: what came of the meetings, beside their notes.
  await registerFreshUser(page)
  const project = await apiPost(page, '/projects', { name: 'Launch' })
  const made = await meeting(page, { title: 'Planning', startsLocal: `${dayOffset(1)}T09:00` })
  const task = await apiPost(page, '/tasks', {
    projectId: project.id,
    title: 'Send the launch brief',
    parentId: null,
  })
  await apiPost(page, '/relations', {
    from: { type: 'task', id: task.id },
    to: { type: 'meeting', id: made.meetingId },
  })
  await page.goto(`/meetings/${made.meetingId}`)
  await expect(page.getByRole('region', { name: 'Tasks from these meetings' })).toContainText(
    'Send the launch brief',
  )
})

test('the repeat chosen follows a new start day, and the menu says which is chosen', async ({
  page,
}) => {
  await registerFreshUser(page)
  await page.goto('/meetings')
  await page.getByRole('main').getByRole('button', { name: 'New meeting' }).click()
  await dialog(page).getByLabel('Title').fill('Weekly sync')
  // A Tuesday, then the Thursday of that week: fixed days, so no run hangs on the clock.
  await fillStart(dialog(page), '2027-01-05')
  await dialog(page).getByLabel('Start time').fill('10:00')
  await pickOne(dialog(page), 'Repeats', 'Every other Tuesday')
  await fillStart(dialog(page), '2027-01-07')
  const repeats = dialog(page).getByRole('button', { name: /^Repeats/ })
  await expect(repeats).toHaveAccessibleName('Repeats: Every other Thursday')

  // The current choice is checked, for a screen reader too, not only marked "Current".
  await repeats.click()
  await expect(page.getByRole('menuitemradio', { name: 'Every other Thursday' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(page.getByRole('menuitemradio', { name: 'Daily' })).toHaveAttribute(
    'aria-checked',
    'false',
  )
  await page.keyboard.press('Escape')

  const made = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/api\/v1\/meetings$/.test(r.url()),
  )
  await dialog(page).getByRole('button', { name: 'Create' }).click()
  const body = (await made).request().postDataJSON() as Record<string, unknown>
  expect(body.rrule).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=TH')
})

test('notes emptied and Done at once are saved empty, not brought back (BUG-089)', async ({
  page,
}) => {
  await registerFreshUser(page)
  const made = await apiPost<{ meetingId: string }>(page, '/meetings', {
    title: 'rust-analyzer sync',
    startsLocal: '2026-09-11T10:30',
    timeZone: 'Europe/London',
    durationMinutes: 30,
  })
  const mira = await apiPost<{ id: string }>(page, '/people', { name: 'Mira Chen' })
  const note = await apiPost<{ id: string }>(page, '/notes', {
    title: null,
    body: `Ask [@Mira Chen](ctws://person/${mira.id}) about the proc-macro server.`,
    anchor: { type: 'meeting', id: made.meetingId, occurrenceId: '2026-09-11T10:30' },
  })
  const relationsOfMira = async () =>
    JSON.stringify(
      await (
        await page.request.get(`/api/v1/relations?type=person&id=${mira.id}`, { headers: WEB })
      ).json(),
    )
  expect(await relationsOfMira()).toContain(note.id)
  await page.goto(`/meetings/${made.meetingId}?at=2026-09-11T10:30`)
  await page.getByRole('button', { name: 'Edit the notes' }).click()
  const box = page.getByRole('textbox', { name: 'Notes for this meeting' })
  await box.fill('')
  // At once, well inside the pause after which typing saves by itself.
  const saved = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().endsWith(`/notes/${note.id}`) && r.ok(),
  )
  await page.getByRole('button', { name: 'Done' }).click()
  await saved
  const read = await page.request.get(`/api/v1/notes/${note.id}`, { headers: WEB })
  expect(((await read.json()) as { body: string }).body).toBe('')
  // Its mention went with its words (FR-042).
  expect(await relationsOfMira()).not.toContain(note.id)
})
