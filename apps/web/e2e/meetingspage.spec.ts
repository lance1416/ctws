import { expect, test, type Page } from '@playwright/test'
import { pickOne, registerFreshUser } from './helpers'

/**
 * 会议 -- the module's own destination, and the form that fills one in once.
 *
 * What is tested here is the framing change, not a list rendering: a meeting is a kind of thing
 * with a page of its own, reached from the rail, and MADE there rather than by clicking a square
 * on a lens. Every assertion below fails against the previous shape, where the module had no
 * route at all.
 */

const HEADERS = { 'x-ctws-client': 'web' }
const dialog = (page: Page) => page.getByRole('dialog', { name: 'New meeting' })
const pane = (page: Page) => page.getByRole('dialog', { name: 'Meetings' })

/** Today and tomorrow in the account's own zone, which is what the page groups by. */
function dayOffset(n: number): string {
  const d = new Date(Date.now() + n * 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test('the rail reaches meetings, and the page says when there are none', async ({ page }) => {
  await registerFreshUser(page)
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Meetings' })
    .click()
  await expect(page).toHaveURL(/\/meetings$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Meetings' })).toBeVisible()
  await expect(page.getByText('Nothing in the next month')).toBeVisible()
})

test('a meeting is filled in once: title, time, zone, repeat and the people', async ({ page }) => {
  await registerFreshUser(page)
  const project = await page.request.post('/api/v1/projects', {
    headers: HEADERS,
    data: { name: 'Job hunt' },
  })
  const projectId = ((await project.json()) as { id: string }).id
  await page.request.post('/api/v1/contacts', { headers: HEADERS, data: { name: 'Ying Chen' } })

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

test('the list is grouped by day, and says what was agreed when that is not your clock', async ({
  page,
}) => {
  await registerFreshUser(page)
  for (const [title, day, zone] of [
    ['Standup', dayOffset(0), 'UTC'],
    ['Second interview', dayOffset(2), 'America/Toronto'],
  ]) {
    const res = await page.request.post('/api/v1/meetings', {
      headers: HEADERS,
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
  // The nearest day is named Today; the rest carry their date.
  await expect(coming.getByRole('heading', { level: 3 }).first()).toHaveText('Today')
  // The row leads with YOUR clock and then says what was agreed, which is the half that is not
  // your clock. Asserted on the agreed string, because the runner's own zone is not fixed.
  await expect(coming).toContainText('14:00 Toronto')
  await expect(coming).toContainText('14:00 UTC')
  await expect(coming.locator('[data-meeting-row]')).toHaveCount(2)
})

test('a repeating meeting is one row, not one row per occurrence', async ({ page }) => {
  // A daily standup has twenty-three occurrences in a month. A page that listed them all would
  // BE the standup: the list answers which meetings there are, the calendar answers which day.
  await registerFreshUser(page)
  const res = await page.request.post('/api/v1/meetings', {
    headers: HEADERS,
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
    headers: HEADERS,
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
    headers: HEADERS,
  })
  const days = ((await got.json()) as { meetings: { recurrenceId: string }[] }).meetings.map((m) =>
    m.recurrenceId.slice(0, 10),
  )
  expect(days).toEqual(['2026-11-03', '2026-11-10', '2026-11-17'])
})

test('a meeting with a link can be joined from the list', async ({ page }) => {
  await registerFreshUser(page)
  await page.request.post('/api/v1/meetings', {
    headers: HEADERS,
    data: {
      title: 'Standup',
      startsLocal: `${dayOffset(1)}T09:30`,
      timeZone: 'UTC',
      durationMinutes: 15,
      location: 'https://meet.example.test/standup',
    },
  })
  await page.request.post('/api/v1/meetings', {
    headers: HEADERS,
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
