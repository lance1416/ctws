import { expect, test, type Page } from '@playwright/test'
import { dayOffset } from './days'
import { registerFreshUser, WEB } from './helpers'

/** The month names the app prints, so a spec can build the string the page will show. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * MEETINGS -- the fourth module, through the browser.
 *
 * The API suite has the recurrence and zone arithmetic. What only a browser can show is the part
 * the feature exists for: a series agreed in Toronto showing on YOUR clock, saying so, and moving
 * by an hour on the week one of the two countries changes its clocks and the other has not.
 */

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
  const res = await page.request.post('/api/v1/meetings', { headers: WEB, data })
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

test('the calendar makes nothing: a day square has no create control', async ({ page }) => {
  // THE FRAMING, as a test. In a calendar app an event is the only entity, so the square is the
  // obvious place to make one. Here the calendar is a LENS over everything with a date and owns
  // no kind of thing, so it offers no way to make one -- a meeting is arranged on its own page.
  await inLondon(page)
  await page.goto('/calendar')
  // The RUNNER's day, which is the account's: the browser registers its user with its own zone.
  // A UTC day was read here before, and for the hours when the two differ it named a square that
  // is not on the grid -- so "no create button" passed because there was nothing to look at.
  const today = dayOffset(0)

  await expect(square(page, today)).toHaveCount(1)
  await expect(square(page, today).getByRole('button')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /New meeting/ })).toHaveCount(0)
})

test('a repeating meeting asks which occurrences a move touches', async ({ page }) => {
  await inLondon(page)
  await arrange(page, WEEKLY_IN_TORONTO)
  await page.goto('/calendar')

  await openOctober(page)
  await square(page, '2026-10-27').getByRole('button', { name: /周会/ }).click()
  await expect(pane(page)).toBeVisible()

  // 改一场会和改一个人、一条任务同一条路：一个 Edit 进表，Save 一次写回。
  await pane(page).getByRole('button', { name: 'Edit', exact: true }).click()
  await pane(page).getByLabel('Start').fill('2026-10-27T15:00')
  await pane(page).getByRole('button', { name: 'Save' }).click()
  // 问的是数据模型本来就有的那个问题，不是为这一刻发明的对话框；一张表只问一次。
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

test('the people in the room come out of the people module', async ({ page }) => {
  await inLondon(page)
  await page.request.post('/api/v1/people', { headers: WEB, data: { name: '陈颖' } })
  await arrange(page, { ...WEEKLY_IN_TORONTO, rrule: null })
  await page.goto('/calendar')
  await openOctober(page)

  await square(page, '2026-10-20').getByRole('button', { name: /周会/ }).click()
  await pane(page).getByRole('button', { name: 'Edit', exact: true }).click()
  await pane(page).getByRole('button', { name: 'Add Attendees' }).click()
  await page.getByRole('menuitem', { name: '陈颖' }).click()
  await pane(page).getByRole('button', { name: 'Save' }).click()
  // 存完回到阅读态：在场的人就写在那儿。
  await expect(pane(page).locator('[data-attendees]')).toContainText('陈颖')
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
  const want = 2026 * 12 + 9
  const monthOn = async () => {
    const shown = (await heading.textContent()) ?? ''
    const [, name, year] = /^([A-Z][a-z]{2}) (\d{4})$/.exec(shown) ?? []
    if (!year || !name) throw new Error(`no month on the page: ${shown}`)
    return Number(year) * 12 + MONTHS.indexOf(name)
  }
  // THE BUDGET IS THE DISTANCE, not a constant. It was 36 steps, which is three years of them:
  // the target month is fixed (it is the one spanning the US clock change) while the grid opens
  // on today, so a constant budget is a date that stops working -- in 2029 this threw instead of
  // walking. One step per month between here and there, plus one to read the arrival.
  const budget = Math.abs((await monthOn()) - want) + 1
  for (let i = 0; i <= budget; i++) {
    const at = await monthOn()
    if (at === want) {
      await expect(page.locator('[data-day="2026-10-20"]')).toBeVisible()
      return
    }
    await page.getByRole('button', { name: at > want ? 'Previous month' : 'Next month' }).click()
  }
  throw new Error('could not reach October 2026')
}

/**
 * THE ABBREVIATION IS THE MEETING'S, NOT TODAY'S.
 *
 * "09:00 EST" and "09:00 EDT" are an hour apart in reality, so the pane for a meeting in January
 * must say EST whatever month it is read in. It used to read the abbreviation at `new Date()`, so
 * for half of every year the meeting's own line was an hour out -- and the existing October case
 * could not catch it, because in October "now" happens to agree.
 *
 * TWO MEETINGS, SIX MONTHS APART, in one zone that changes its clocks: whenever this runs, one of
 * them disagrees with today, so a label read at "now" cannot pass both. Both dates are fixed, so
 * both expectations are true forever.
 */
test('a meeting says the zone abbreviation of its own date, not of today', async ({ page }) => {
  await inLondon(page)
  const winter = await arrange(page, {
    title: '冬天那场',
    startsLocal: '2026-01-20T09:00',
    timeZone: 'America/Toronto',
    durationMinutes: 60,
  })
  const summer = await arrange(page, {
    title: '夏天那场',
    startsLocal: '2026-07-20T09:00',
    timeZone: 'America/Toronto',
    durationMinutes: 60,
  })

  await page.goto(`/meetings/${winter.meetingId}`)
  await expect(pane(page)).toContainText('Toronto · EST')
  await expect(pane(page)).not.toContainText('EDT')

  await page.goto(`/meetings/${summer.meetingId}`)
  await expect(pane(page)).toContainText('Toronto · EDT')
  await expect(pane(page)).not.toContainText('EST')
})
