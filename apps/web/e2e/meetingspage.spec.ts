import { expect, test, type Page } from '@playwright/test'
import { TZDate } from '@date-fns/tz'
import { dayOffset } from './days'
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

/**
 * 会议的面板和人的面板长成同一套。
 *
 * 同一个人在同一块屏幕上读这两种东西：字段的标签都在值上面、列数都看这一块自己有多宽、面板右上
 * 角都有一个 ↗ 通往那一页。会议这边以前连去那一页的路都没有 —— 左上角那两个字是个 span。
 */
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
  await expect(page).toHaveURL(new RegExp('/meetings/[0-9a-f-]{36}$'))
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
