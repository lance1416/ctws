import { expect, test, type Page } from '@playwright/test'
import { registerFreshUser } from './helpers'

/** The month names the app prints, so a spec can build the string the page will show. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * 会议 -- the fourth module, through the browser.
 *
 * The API suite has the recurrence and zone arithmetic. What only a browser can show is the part
 * the feature exists for: a series agreed in Toronto showing on YOUR clock, saying so, and moving
 * by an hour on the week one of the two countries changes its clocks and the other has not.
 */

const HEADERS = { 'x-ctws-client': 'web' }

/**
 * THE ACCOUNT IS IN LONDON for this whole file.
 *
 * An account's zone is taken from the browser when it registers, so this is how it is set -- and
 * it has to be set, or the clock on screen would be the runner's machine and the assertions below
 * would pass or fail by where the test happened to run.
 */
test.use({ timezoneId: 'Europe/London' })

const square = (page: Page, day: string) => page.locator(`[data-day="${day}"]`)
const pane = (page: Page) => page.getByRole('dialog', { name: 'Meetings' })

async function arrange(page: Page, data: Record<string, unknown>) {
  const res = await page.request.post('/api/v1/meetings', { headers: HEADERS, data })
  expect(res.status(), await res.text()).toBe(201)
  return res.json() as Promise<{ meetingId: string; recurrenceId: string }>
}

const inLondon = (page: Page) => registerFreshUser(page, '/')

const WEEKLY_IN_TORONTO = {
  title: '周会',
  startsLocal: '2026-10-20T09:00',
  timeZone: 'America/Toronto',
  durationMinutes: 60,
  rrule: 'FREQ=WEEKLY;BYDAY=TU',
}

test('a series agreed in Toronto shows on your clock, and says whose 09:00 it is', async ({
  page,
}) => {
  await inLondon(page)
  await arrange(page, WEEKLY_IN_TORONTO)
  await page.goto('/calendar')
  await openOctober(page)

  // Britain leaves BST on 2026-10-25 and Toronto leaves EDT on 2026-11-01, so for that one week
  // the same 09:00 in Toronto is an hour earlier here. This is the whole reason the zone belongs
  // to the meeting and not to the account.
  await expect(square(page, '2026-10-20')).toContainText('14:00')
  await expect(square(page, '2026-10-27')).toContainText('13:00')
  // And it says what was actually agreed, not only what it is here.
  await expect(square(page, '2026-10-20')).toContainText('EDT')
})

test('clicking an empty day arranges a meeting there', async ({ page }) => {
  // A calendar you can only read is half a calendar; clicking a day is how every one of them has
  // worked.
  await inLondon(page)
  await page.goto('/calendar')
  const today = new Date().toISOString().slice(0, 10)

  await square(page, today)
    .getByRole('button', { name: /New meeting/ })
    .click()
  await expect(square(page, today)).toContainText('New meeting')
})

test('a repeating meeting asks which occurrences a move touches', async ({ page }) => {
  await inLondon(page)
  await arrange(page, WEEKLY_IN_TORONTO)
  await page.goto('/calendar')

  await openOctober(page)
  await square(page, '2026-10-27').getByRole('button', { name: /周会/ }).click()
  await expect(pane(page)).toBeVisible()

  await pane(page).getByLabel('Start').fill('2026-10-27T15:00')
  // Clicking elsewhere, not Tab: a `datetime-local` has internal segments and Tab moves BETWEEN
  // THEM, so the field never blurs and nothing is committed. Leaving it is what commits it; there
  // is no 保存 anywhere in this pane.
  await pane(page).getByText('Length').click()
  // The question is the data model surfacing, not a dialog invented for the occasion.
  await expect(page.getByRole('alertdialog', { name: 'This meeting repeats' })).toBeVisible()
  await page.getByRole('button', { name: 'Just this one' }).click()

  // THAT WEEK MOVED AND THE OTHERS DID NOT. 15:00 in Toronto on the 27th is 19:00 in London,
  // which is already on GMT by then.
  await expect(square(page, '2026-10-27')).toContainText('19:00')
  await expect(square(page, '2026-10-27')).not.toContainText('13:00')
  await expect(square(page, '2026-10-20')).toContainText('14:00')
})

test('cancelling one week leaves the series alone', async ({ page }) => {
  await inLondon(page)
  await arrange(page, WEEKLY_IN_TORONTO)
  await page.goto('/calendar')
  await openOctober(page)

  await square(page, '2026-10-27').getByRole('button', { name: /周会/ }).click()
  await pane(page).getByRole('button', { name: 'Cancel meeting' }).click()
  await page.getByRole('button', { name: 'Just this one' }).click()

  await expect(square(page, '2026-10-27')).not.toContainText('周会')
  await expect(square(page, '2026-10-20')).toContainText('周会')
})

test('the people in the room come out of the contacts module', async ({ page }) => {
  await inLondon(page)
  await page.request.post('/api/v1/contacts', { headers: HEADERS, data: { name: '陈颖' } })
  await arrange(page, { ...WEEKLY_IN_TORONTO, rrule: null })
  await page.goto('/calendar')
  await openOctober(page)

  await square(page, '2026-10-20').getByRole('button', { name: /周会/ }).click()
  await pane(page).getByRole('button', { name: 'Add Attendees' }).click()
  await page.getByRole('menuitem', { name: '陈颖' }).click()
  await expect(pane(page).getByRole('button', { name: 'Remove Attendees “陈颖”' })).toBeVisible()
})

/**
 * Steps the grid to October 2026, reading the month off the page each time.
 *
 * The direction is decided from what is SHOWN, not from today: a fixed direction computed once
 * walks away from the target the moment the grid already starts on it, which is exactly what
 * happened.
 */
async function openOctober(page: Page) {
  const heading = page.getByText(/^[A-Z][a-z]{2} \d{4}$/)
  for (let i = 0; i < 36; i++) {
    const shown = (await heading.textContent()) ?? ''
    const [, name, year] = /^([A-Z][a-z]{2}) (\d{4})$/.exec(shown) ?? []
    if (!year || !name) throw new Error(`no month on the page: ${shown}`)
    const at = Number(year) * 12 + MONTHS.indexOf(name)
    const want = 2026 * 12 + 9
    if (at === want) {
      await expect(page.locator('[data-day="2026-10-20"]')).toBeVisible()
      return
    }
    await page.getByRole('button', { name: at > want ? 'Previous month' : 'Next month' }).click()
  }
  throw new Error('could not reach October 2026')
}
