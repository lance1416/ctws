import { expect, test, type Page } from '@playwright/test'
import { TZDate } from '@date-fns/tz'
import { addDaysYmd, dayOffset } from './days'
import { accountZone, apiPost, editDetail, pickOne, registerFreshUser, WEB } from './helpers'

/**
 * MEETINGS -- the module's own destination, and the form that fills one in once.
 *
 * What is tested here is the framing change, not a list rendering: a meeting is a kind of thing
 * with a page of its own, reached from the rail, and MADE there rather than by clicking a square
 * on a lens. Every assertion below fails against the previous shape, where the module had no
 * route at all.
 */

const dialog = (page: Page) => page.getByRole('dialog', { name: 'New meeting' })
const pane = (page: Page) => page.getByRole('dialog', { name: 'Meetings' })

/** The month names the app prints, so a spec can build the string the page will show. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

test('Things reaches meetings, and the page says when there are none', async ({ page }) => {
  // Kinds sit behind Things, not one row each in the rail.
  await registerFreshUser(page)
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Things' })
    .click()
  await page.locator('[data-kind="Meetings"]').getByRole('link', { name: 'Meetings' }).click()
  await expect(page).toHaveURL(/\/meetings$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Meetings' })).toBeVisible()
  await expect(page.getByText('Nothing in the next month')).toBeVisible()
})

test('a meeting is filled in once: title, time, zone, repeat and the people', async ({ page }) => {
  await registerFreshUser(page)
  const project = await page.request.post('/api/v1/projects', {
    headers: WEB,
    data: { name: 'Job hunt' },
  })
  const projectId = ((await project.json()) as { id: string }).id
  await page.request.post('/api/v1/people', { headers: WEB, data: { name: 'Ying Chen' } })

  await page.goto('/meetings')
  await page.getByRole('button', { name: 'New meeting' }).click()

  await dialog(page).getByLabel('Title').fill('Second interview')
  await dialog(page).getByLabel('Date').fill(dayOffset(1))
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

  // ONE REQUEST carries the whole meeting. The previous shape made an empty one and left the
  // rest to the pane, which is what "create, then open it and fill it in" means.
  expect(body).toMatchObject({
    title: 'Second interview',
    startsLocal: `${dayOffset(1)}T21:00`,
    timeZone: 'America/Toronto',
    durationMinutes: 90,
    rrule: 'FREQ=DAILY',
    projectId,
  })
  expect((body.attendeeIds as string[]).length).toBe(1)

  // And it opens on the thing that was just made, where a note or a place is added.
  await expect(pane(page)).toBeVisible()
  await expect(pane(page)).toContainText('Second interview')
})

/**
 * THE AGREED ZONE IS THE HALF THAT IS NOT YOUR CLOCK, so the row carries it only when the
 * meeting's zone is not the account's, and the account's zone is the runner's (see `days.ts`).
 * Both halves are seeded: one meeting agreed HERE, one agreed where the runner is not. Written
 * down as `UTC`, the second half was a label only on a machine outside UTC -- true of every
 * machine this suite had run on, and false on CI's.
 */
const HERE = Intl.DateTimeFormat().resolvedOptions().timeZone
const ELSEWHERE = ['America/Toronto', 'Asia/Tokyo'].find((z) => z !== HERE)!
/** The half of an IANA name a reader knows, the way `zoneLabel` prints it. */
const ELSEWHERE_CITY = ELSEWHERE.slice(ELSEWHERE.indexOf('/') + 1).replace(/_/g, ' ')

test('the list is grouped by day, and says what was agreed when that is not your clock', async ({
  page,
}) => {
  await registerFreshUser(page)
  for (const [title, day, zone] of [
    ['Standup', dayOffset(0), HERE],
    ['Second interview', dayOffset(2), ELSEWHERE],
  ]) {
    const res = await page.request.post('/api/v1/meetings', {
      headers: WEB,
      data: {
        title,
        startsLocal: `${day}T14:00`,
        timeZone: zone,
        durationMinutes: 60,
      },
    })
    expect(res.ok()).toBe(true)
  }

  await page.goto('/meetings')
  const coming = page.getByRole('region', { name: 'Coming up' })
  await expect(coming).toBeVisible()
  // The nearest day is named Today; the rest carry their date. Each day is a section of the page.
  await expect(coming.getByRole('heading', { level: 2 }).first()).toHaveText('Today')
  // The row leads with YOUR clock, and then says what was agreed -- when that is somewhere else.
  const row = (title: string) => coming.locator('[data-meeting-row]').filter({ hasText: title })
  await expect(row('Second interview').locator('[data-meeting-zone]')).toContainText(
    `14:00 ${ELSEWHERE_CITY}`,
  )
  // And says nothing twice: a meeting agreed in your own zone is the clock already on the row.
  await expect(row('Standup').locator('[data-meeting-zone]')).toHaveCount(0)
  await expect(coming.locator('[data-meeting-row]')).toHaveCount(2)
})

test('a repeating meeting is one row, not one row per occurrence', async ({ page }) => {
  // A daily standup has twenty-three occurrences in a month. A page that listed them all would
  // BE the standup: the list answers which meetings there are, the calendar answers which day.
  await registerFreshUser(page)
  const res = await page.request.post('/api/v1/meetings', {
    headers: WEB,
    data: {
      title: 'Standup',
      startsLocal: `${dayOffset(0)}T09:30`,
      timeZone: 'UTC',
      durationMinutes: 15,
      rrule: 'FREQ=DAILY',
    },
  })
  expect(res.ok()).toBe(true)

  await page.goto('/meetings')
  await expect(page.locator('[data-meeting-row]')).toHaveCount(1)
  // And it says that it repeats, in the words the picker offers.
  await expect(page.getByRole('region', { name: 'Coming up' })).toContainText('Daily')
})

test('what has already happened is behind a toggle, not in front of you', async ({ page }) => {
  await registerFreshUser(page)
  await page.request.post('/api/v1/meetings', {
    headers: WEB,
    data: {
      title: 'Last week one-to-one',
      startsLocal: `${dayOffset(-7)}T14:00`,
      timeZone: 'UTC',
      durationMinutes: 30,
    },
  })

  await page.goto('/meetings')
  await expect(page.getByText('Last week one-to-one')).toHaveCount(0)
  await page.getByRole('button', { name: 'Earlier' }).click()
  await expect(page.getByText('Last week one-to-one')).toBeVisible()
  await page.getByRole('button', { name: 'Hide earlier' }).click()
  await expect(page.getByText('Last week one-to-one')).toHaveCount(0)
})

test('a repeat can be given an end date, and the series really stops there', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/meetings')
  await page.getByRole('button', { name: 'New meeting' }).click()

  const form = dialog(page)
  await form.getByLabel('Title').fill('Weekly sync')
  await form.getByLabel('Date').fill('2026-11-03') // a Tuesday
  await form.getByLabel('Start time').fill('09:00')
  await form.getByLabel('Location').fill('https://meet.example.test/abc')
  await pickOne(form, 'Repeats', 'Weekly on Tuesday')
  await form.getByLabel('Ends').fill('2026-11-17')

  const made = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/api\/v1\/meetings$/.test(r.url()),
  )
  await form.getByRole('button', { name: 'Create' }).click()
  const body = (await made).request().postDataJSON() as { rrule: string; location: string }

  // The end is written in the SAME naive space as the start, at the end of the chosen day.
  expect(body.rrule).toBe('FREQ=WEEKLY;BYDAY=TU;UNTIL=20261117T235959Z')
  expect(body.location).toBe('https://meet.example.test/abc')

  // And the server agrees: three Tuesdays, not a fourth.
  const got = await page.request.get('/api/v1/meetings?from=2026-11-01&to=2026-11-30', {
    headers: WEB,
  })
  const days = ((await got.json()) as { meetings: { recurrenceId: string }[] }).meetings.map((m) =>
    m.recurrenceId.slice(0, 10),
  )
  expect(days).toEqual(['2026-11-03', '2026-11-10', '2026-11-17'])
})

test('a meeting with a link can be joined from the list', async ({ page }) => {
  await registerFreshUser(page)
  await page.request.post('/api/v1/meetings', {
    headers: WEB,
    data: {
      title: 'Standup',
      startsLocal: `${dayOffset(1)}T09:30`,
      timeZone: 'UTC',
      durationMinutes: 15,
      location: 'https://meet.example.test/standup',
    },
  })
  await page.request.post('/api/v1/meetings', {
    headers: WEB,
    data: {
      title: 'In the room',
      startsLocal: `${dayOffset(1)}T14:00`,
      timeZone: 'UTC',
      durationMinutes: 30,
      location: 'Acme HQ, 3F',
    },
  })

  await page.goto('/meetings')
  const join = page.getByRole('link', { name: 'Join' })
  await expect(join).toHaveCount(1)
  await expect(join).toHaveAttribute('href', 'https://meet.example.test/standup')
  // A room is not a link. Guessing would send you to a site that may be somebody else's.
  await expect(page.getByText('In the room')).toBeVisible()
})

/** A meeting pane is laid out like a person's. */
test('a meeting pane stacks its labels over its values, and has no page to open', async ({
  page,
}) => {
  await registerFreshUser(page)
  const made = await page.request.post('/api/v1/meetings', {
    headers: WEB,
    data: {
      title: '周会',
      startsLocal: '2026-10-20T09:00',
      timeZone: 'America/Toronto',
      durationMinutes: 30,
    },
  })
  expect(made.ok()).toBe(true)

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/meetings')
  await page.getByRole('button', { name: /周会/ }).first().click()
  const pane = page.getByRole('dialog', { name: 'Meetings' })
  await expect(pane).toBeVisible()

  // The label's bottom is above the value's top. Read, a value is text, so that line is measured.
  const stacked = await pane.evaluate(() => {
    const label = [...document.querySelectorAll('span')].find((s) => s.textContent === 'Length')
    const value = label?.parentElement?.querySelector('span:last-child')
    if (!label || !value || label === value) return null
    return label.getBoundingClientRect().bottom <= value.getBoundingClientRect().top + 1
  })
  expect(stacked).toBe(true)

  // The pane is at the meeting's own address already: there is nowhere else to open it.
  await expect(page).toHaveURL(new RegExp('/meetings/[0-9a-f-]{36}\\?at='))
  await expect(pane.getByRole('link', { name: 'Open as a page' })).toHaveCount(0)
})

/**
 * A MEETING'S ROW IS THE APP'S ROW: the time on your own clock in the margin, the thread in its
 * project's colour, then the title and a line that says the rest -- the project BY NAME, who is in
 * it. The days are sections whose headings hang where the threads do, as the page's title does.
 */
test('meetings hang on the margin: the time, the thread, then the meeting', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await registerFreshUser(page)
  const project = await page.request.post('/api/v1/projects', {
    headers: WEB,
    data: { name: '找工作' },
  })
  const projectId = ((await project.json()) as { id: string }).id
  const made = await page.request.post('/api/v1/meetings', {
    headers: WEB,
    data: {
      title: 'Second interview',
      startsLocal: `${dayOffset(1)}T14:00`,
      // Agreed on the account's own clock, so the margin's 14:00 is the time agreed.
      timeZone: await accountZone(page),
      durationMinutes: 60,
      projectId,
    },
  })
  expect(made.ok(), await made.text()).toBe(true)
  const { meetingId } = (await made.json()) as { meetingId: string }
  await page.request.post('/api/v1/meetings', {
    headers: WEB,
    data: {
      title: 'Standup',
      startsLocal: `${dayOffset(2)}T09:30`,
      timeZone: 'UTC',
      durationMinutes: 15,
    },
  })
  await page.goto('/meetings')

  const row = page.locator(`[data-meeting-row="${meetingId}"]`)
  await expect(row.locator('[data-row-lead-text]')).toHaveText('14:00')
  await expect(row.locator('[data-project-rail]')).toHaveAttribute('data-project-rail', projectId)
  // The colour is never alone: the project is named on the row.
  await expect(row).toContainText('找工作')
  await expect(
    page.getByRole('region', { name: 'Coming up' }).getByRole('heading', { level: 2 }).first(),
  ).toHaveText('Tomorrow')

  // ONE x for the threads, and the page's title and the days' headings hang on it.
  const threads = await page
    .locator('[data-meeting-row] [data-thread]')
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().x)))
  expect(threads).toHaveLength(2)
  expect(new Set(threads).size).toBe(1)
  const h1 = (await page.getByRole('heading', { level: 1, name: 'Meetings' }).boundingBox())!
  expect(Math.round(h1.x)).toBe(threads[0])
  const day = (await page.getByRole('heading', { level: 2, name: 'Tomorrow' }).boundingBox())!
  expect(Math.round(day.x)).toBe(threads[0])
})

/**
 * A SERIES' ROW CARRIES ITS NEXT TIME. At 15:00 a daily 09:00 standup's next one is tomorrow's,
 * not this morning's, which is over; the row sits under Tomorrow. The clock is the test's own.
 */
test('a repeating meeting shows its next occurrence, not one already over', async ({ page }) => {
  await registerFreshUser(page)
  const zone = await accountZone(page)
  const res = await page.request.post('/api/v1/meetings', {
    headers: WEB,
    data: {
      title: 'Standup',
      startsLocal: `${dayOffset(0)}T09:00`,
      timeZone: zone,
      durationMinutes: 15,
      rrule: 'FREQ=DAILY',
    },
  })
  expect(res.ok(), await res.text()).toBe(true)
  const [y, m, d] = dayOffset(0).split('-').map(Number) as [number, number, number]
  await page.clock.install({ time: new TZDate(y, m - 1, d, 15, 0, 0, 0, zone) })
  await page.goto('/meetings')
  const tomorrow = page.getByRole('region', { name: 'Tomorrow' })
  await expect(tomorrow.locator('[data-meeting-row]')).toHaveCount(1)
  await expect(page.getByRole('region', { name: 'Today' })).toHaveCount(0)
})

/** `BYDAY`'s code for the weekday `day` falls on. */
const weekdayCode = (day: string) =>
  ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][new Date(`${day}T12:00:00Z`).getUTCDay()]!

test('backing out of the scope question saves nothing from that edit', async ({ page }) => {
  await registerFreshUser(page)
  const today = dayOffset(0)
  const made = await apiPost(page, '/meetings', {
    title: 'Weekly sync',
    startsLocal: `${today}T09:00`,
    timeZone: await accountZone(page),
    durationMinutes: 30,
    rrule: `FREQ=WEEKLY;BYDAY=${weekdayCode(today)}`,
  })
  await page.goto(`/meetings/${made.meetingId}`)
  await editDetail(page)
  await pane(page).getByLabel('Title').fill('Renamed sync')
  await pane(page).getByLabel('Start').fill(`${today}T10:00`)
  await pane(page).getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('alertdialog', { name: 'This meeting repeats' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep editing' }).click()
  // Nothing in flight: a write sent before the question would still hold Save down.
  await expect(pane(page).getByRole('button', { name: 'Save' })).toBeEnabled()
  await pane(page).getByRole('button', { name: 'Cancel', exact: true }).click()

  const res = await page.request.get(`/api/v1/meetings?from=${today}&to=${today}`, {
    headers: WEB,
  })
  const held = ((await res.json()) as { meetings: { title: string; startsLocal: string }[] })
    .meetings
  expect(held.map((m) => [m.title, m.startsLocal])).toEqual([['Weekly sync', `${today}T09:00`]])
})

test('a past occurrence opens as itself, not as the next one', async ({ page }) => {
  await registerFreshUser(page)
  const today = dayOffset(0)
  const start = addDaysYmd(today, -14)
  await apiPost(page, '/meetings', {
    title: 'Standing call',
    startsLocal: `${start}T09:00`,
    timeZone: await accountZone(page),
    durationMinutes: 30,
    rrule: `FREQ=WEEKLY;BYDAY=${weekdayCode(start)}`,
  })
  await page.goto('/meetings')
  await page.getByRole('button', { name: 'Earlier', exact: true }).click()
  // Earlier shows each series' latest occurrence: last week's.
  const lastWeek = addDaysYmd(today, -7)
  await page
    .getByRole('region', { name: 'Earlier' })
    .getByRole('button', { name: /Standing call/ })
    .click()
  await expect(page).toHaveURL(new RegExp(`at=${lastWeek}T09(%3A|:)00`))
  const [, m, d] = lastWeek.split('-').map(Number) as [number, number, number]
  // The year is printed only when it is not this one, as in the first week of January.
  await expect(pane(page)).toContainText(new RegExp(`${MONTHS[m - 1]} ${d}(, \\d{4})?, 09:00`))
})

test('a meeting edit the server refuses stays open and says why', async ({ page }) => {
  await registerFreshUser(page)
  const made = await apiPost(page, '/meetings', {
    title: 'Refused sync',
    startsLocal: `${dayOffset(1)}T09:00`,
    timeZone: await accountZone(page),
    durationMinutes: 30,
  })
  await page.goto(`/meetings/${made.meetingId}`)
  await editDetail(page)
  await pane(page).getByLabel('Title').fill('Refused again')
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
  await pane(page).getByRole('button', { name: 'Save' }).click()
  await expect(pane(page).getByRole('alert')).toContainText('That title is too long')
  await expect(pane(page).getByLabel('Title')).toHaveValue('Refused again')
})

/** Moves the open meeting's start to `at` from its pane, answering the scope question if asked. */
async function moveOpenMeeting(page: Page, at: string, scope?: 'This and all later') {
  await editDetail(page)
  await pane(page).getByLabel('Start').fill(at)
  await pane(page).getByRole('button', { name: 'Save' }).click()
  if (scope) await page.getByRole('button', { name: scope }).click()
}

test('a one-off meeting moved from its pane stays open at its new time', async ({ page }) => {
  await registerFreshUser(page)
  const day = dayOffset(1)
  await apiPost(page, '/meetings', {
    title: 'One-off',
    startsLocal: `${day}T09:00`,
    timeZone: await accountZone(page),
    durationMinutes: 30,
  })
  await page.goto('/meetings')
  await page.getByRole('button', { name: 'One-off' }).click()
  await moveOpenMeeting(page, `${day}T11:00`)
  await expect(page).toHaveURL(new RegExp(`at=${day}T11(%3A|:)00`))
  await expect(pane(page)).toContainText('11:00')
  await expect(page.getByText('This meeting is not here any more.')).toHaveCount(0)
})

test('this and all later, moved from the pane, stays open on the new series', async ({ page }) => {
  await registerFreshUser(page)
  const start = dayOffset(-7)
  await apiPost(page, '/meetings', {
    title: 'Weekly',
    startsLocal: `${start}T09:00`,
    timeZone: await accountZone(page),
    durationMinutes: 30,
    rrule: `FREQ=WEEKLY;BYDAY=${weekdayCode(start)}`,
  })
  const next = dayOffset(7)
  await page.goto('/meetings')
  await page
    .getByRole('region', { name: 'Coming up' })
    .getByRole('button', { name: 'Weekly' })
    .click()
  await moveOpenMeeting(page, `${next}T10:00`, 'This and all later')
  await expect(page).toHaveURL(new RegExp(`at=${next}T10(%3A|:)00`))
  await expect(pane(page)).toContainText('10:00')
  await expect(page.getByText('This meeting is not here any more.')).toHaveCount(0)
})

test('an occurrence that ends while its pane is open keeps the edit in it', async ({ page }) => {
  await registerFreshUser(page)
  const today = dayOffset(0)
  await apiPost(page, '/meetings', {
    title: 'Standup',
    startsLocal: `${today}T09:00`,
    timeZone: await accountZone(page),
    durationMinutes: 30,
    rrule: 'FREQ=DAILY',
  })
  // The runner's day is the account's, so a local 09:10 is during the 09:00 standup.
  await page.clock.install({ time: new Date(`${today}T09:10:00`) })
  await page.goto('/meetings')
  await page.getByRole('button', { name: 'Standup' }).click()
  await editDetail(page)
  await pane(page).getByLabel('Notes').fill('half a thought')
  // Past its end, the list's row for the series becomes tomorrow's.
  await page.clock.fastForward('25:00')
  await expect(pane(page).getByLabel('Notes')).toHaveValue('half a thought')
})

test('a held Enter on Cancel meeting does not also cancel a repeating one', async ({ page }) => {
  await registerFreshUser(page)
  const day = dayOffset(1)
  const made = await apiPost(page, '/meetings', {
    title: 'Keep me',
    startsLocal: `${day}T09:00`,
    timeZone: await accountZone(page),
    durationMinutes: 30,
    rrule: `FREQ=WEEKLY;BYDAY=${weekdayCode(day)}`,
  })
  await page.goto(`/meetings/${made.meetingId}`)
  await pane(page).getByRole('button', { name: 'Cancel meeting' }).focus()
  // Key repeat: the second Enter lands on whatever took focus when the question opened.
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  const res = await page.request.get(`/api/v1/meetings?from=${day}&to=${day}`, { headers: WEB })
  const titles = ((await res.json()) as { meetings: { title: string }[] }).meetings
  expect(titles.map((m) => m.title)).toEqual(['Keep me'])
})

test('renaming a series keeps the week that was moved on its own', async ({ page }) => {
  await registerFreshUser(page)
  const day = dayOffset(1)
  const later = addDaysYmd(day, 7)
  const made = await apiPost(page, '/meetings', {
    title: 'Sync',
    startsLocal: `${day}T09:00`,
    timeZone: await accountZone(page),
    durationMinutes: 30,
    rrule: `FREQ=WEEKLY;BYDAY=${weekdayCode(day)}`,
  })
  const moved = await page.request.patch(`/api/v1/meetings/${made.meetingId}`, {
    headers: WEB,
    data: { startsLocal: `${later}T15:00`, scope: 'one', recurrenceId: `${later}T09:00` },
  })
  expect(moved.ok(), await moved.text()).toBe(true)

  await page.goto(`/meetings/${made.meetingId}`)
  await editDetail(page)
  await pane(page).getByLabel('Title').fill('Sync, renamed')
  await pane(page).getByRole('button', { name: 'Save' }).click()
  await expect(pane(page).getByRole('button', { name: 'Edit', exact: true })).toBeVisible()

  const res = await page.request.get(`/api/v1/meetings?from=${later}&to=${later}`, {
    headers: WEB,
  })
  const held = ((await res.json()) as { meetings: { title: string; startsLocal: string }[] })
    .meetings
  expect(held.map((m) => [m.title, m.startsLocal])).toEqual([['Sync, renamed', `${later}T15:00`]])
})

test('renaming the first half of a split series keeps its moved week and its end', async ({
  page,
}) => {
  await registerFreshUser(page)
  const day = dayOffset(1)
  const moved = addDaysYmd(day, 7)
  const split = addDaysYmd(day, 14)
  const made = await apiPost(page, '/meetings', {
    title: 'Sync',
    startsLocal: `${day}T09:00`,
    timeZone: await accountZone(page),
    durationMinutes: 30,
    rrule: `FREQ=WEEKLY;BYDAY=${weekdayCode(day)}`,
  })
  const edit = async (data: object) => {
    const res = await page.request.patch(`/api/v1/meetings/${made.meetingId}`, {
      headers: WEB,
      data,
    })
    expect(res.ok(), await res.text()).toBe(true)
  }
  await edit({ startsLocal: `${moved}T15:00`, scope: 'one', recurrenceId: `${moved}T09:00` })
  await edit({ title: 'Sync, later', scope: 'following', recurrenceId: `${split}T09:00` })

  await page.goto(`/meetings/${made.meetingId}`)
  await editDetail(page)
  await pane(page).getByLabel('Title').fill('Sync, renamed')
  await pane(page).getByRole('button', { name: 'Save' }).click()
  await expect(pane(page).getByRole('button', { name: 'Edit', exact: true })).toBeVisible()

  const on = async (d: string) => {
    const res = await page.request.get(`/api/v1/meetings?from=${d}&to=${d}`, { headers: WEB })
    return ((await res.json()) as { meetings: { title: string; startsLocal: string }[] }).meetings
      .map((m) => [m.title, m.startsLocal])
      .sort()
  }
  expect(await on(moved)).toEqual([['Sync, renamed', `${moved}T15:00`]])
  expect(await on(split)).toEqual([['Sync, later', `${split}T09:00`]])
})

test('jumping to a meeting outside the list does not leave the last one in the pane', async ({
  page,
}) => {
  await registerFreshUser(page)
  const zone = await accountZone(page)
  const day = dayOffset(1)
  const far = addDaysYmd(day, 60)
  await apiPost(page, '/meetings', {
    title: 'Alpha',
    startsLocal: `${day}T09:00`,
    timeZone: zone,
    durationMinutes: 30,
  })
  const bravo = await apiPost(page, '/meetings', {
    title: 'Bravo',
    startsLocal: `${far}T09:00`,
    timeZone: zone,
    durationMinutes: 30,
  })
  await page.goto('/meetings')
  await page.getByRole('button', { name: 'Alpha' }).click()
  await expect(pane(page)).toContainText('Alpha')

  // Bravo is past the list's month, so it is looked up on its own; hold that lookup.
  let release = () => {}
  const held = new Promise<void>((r) => (release = r))
  await page.route(
    (url) => url.pathname.endsWith(`/meetings/${bravo.meetingId}`),
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
  await expect(pane(page).getByText('Alpha')).toHaveCount(0)
  release()
  await expect(pane(page)).toContainText('Bravo')
})

test('a meeting with no start cannot be saved', async ({ page }) => {
  await registerFreshUser(page)
  const made = await apiPost(page, '/meetings', {
    title: 'Somewhen',
    startsLocal: `${dayOffset(1)}T09:00`,
    timeZone: await accountZone(page),
    durationMinutes: 30,
  })
  await page.goto(`/meetings/${made.meetingId}`)
  await editDetail(page)
  await pane(page).getByLabel('Start').fill('')
  await expect(pane(page).getByRole('button', { name: 'Save' })).toBeDisabled()
})
