import { expect, test } from '@playwright/test'
import { editDetail, openProject, registerFreshUser, submitCreate, WEB } from './helpers'
import { MONTHS } from './days'

/**
 * THE ONE PLACE THE ACCOUNT'S TIMEZONE IS NOT THE RUNNER'S.
 *
 * Every other spec registers its user from a browser running in the test process's own zone, so
 * `users.timezone` always equals `TZ` and the whole suite is blind to the bug class that actually
 * bit this project three times: the server deciding which day it is in one zone while the page
 * says a day worked out in another: a reader on another machine shown a task the server has
 * filed as overdue whose own row says it is due tomorrow.
 *
 * Nothing new was built to close this. Playwright contexts take a `timezoneId`, the login form
 * already registers with `Intl.DateTimeFormat().resolvedOptions().timeZone`, and `test.use` sets
 * it for a file -- so the account's zone is simply a different one than the process's, and the
 * ordinary helpers work unchanged.
 */

/** The runner's own calendar day. Both zones below are deliberately far from it. */
const runnerDay = () => new Date().toLocaleDateString('en-CA')
const dayIn = (timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

/**
 * UTC+14 and UTC-11: 25 hours apart, so they are NEVER on the same calendar day as each other and
 * at least one of them always differs from the runner, wherever and whenever the suite runs.
 * Neither observes DST, so the offset is not a moving target either.
 */
const ACCOUNT_TZ = ['Pacific/Kiritimati', 'Pacific/Niue'].find((z) => dayIn(z) !== runnerDay())!

test.use({ timezoneId: ACCOUNT_TZ })

test('the account is registered in the browser zone, which is not the runner zone', async ({
  page,
}) => {
  await registerFreshUser(page)
  // THE PREMISE OF EVERY TEST BELOW, asserted rather than assumed: without it they would still
  // pass with the two zones equal, which is exactly the blind spot being closed.
  expect(dayIn(ACCOUNT_TZ), 'the two zones must be on different days').not.toBe(runnerDay())
  const me = await page.request.get('/api/v1/auth/me')
  expect(me.ok()).toBe(true)
  expect((await me.json()).timezone).toBe(ACCOUNT_TZ)
})

test('today means today in the account zone, for the list and the caption alike', async ({
  page,
}) => {
  await registerFreshUser(page)
  await submitCreate(page, 'Capture…', '按账户时区排的')

  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Projects' })
    .click()
  await openProject(page, 'Inbox')
  await page.getByRole('listitem').filter({ hasText: '按账户时区排的' }).click()
  await editDetail(page)
  // Wait for the write itself, not for a control to come back: the next step navigates, and a
  // navigation that outruns its own save is the flake this suite has already paid for twice.
  const saved = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.ok() && /\/api\/v1\/tasks\//.test(r.url()),
  )
  await page.getByLabel('Plan', { exact: true }).fill(dayIn(ACCOUNT_TZ))
  await page.getByRole('button', { name: 'Save' }).click()
  await saved

  await page.getByRole('link', { name: 'Today' }).click()
  // The SERVER put it here, having compared the day string against `now() at time zone $tz`. In
  // the runner's zone this is yesterday or tomorrow, so a server reading its own clock misses it.
  await expect(
    page.getByRole('region', { name: 'Today', exact: true }).getByText('按账户时区排的'),
  ).toBeVisible()

  // And the page's own heading -- the date -- agrees with the server, which is the half that broke
  // before: the day comes from the account zone, never the browser's or the runner's.
  const [y, month, day] = dayIn(ACCOUNT_TZ).split('-').map(Number) as [number, number, number]
  const said = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(Date.UTC(y, month - 1, day, 12))
  await expect(page.locator('#today-heading')).toHaveText(said)
})

test('the runner’s today is some OTHER day, and the page says which', async ({ page }) => {
  await registerFreshUser(page)
  await submitCreate(page, 'Capture…', '按进程时区排的')

  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Projects' })
    .click()
  await openProject(page, 'Inbox')
  await page.getByRole('listitem').filter({ hasText: '按进程时区排的' }).click()
  await editDetail(page)
  // Wait for the write itself, not for a control to come back: the next step navigates, and a
  // navigation that outruns its own save is the flake this suite has already paid for twice.
  const saved = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.ok() && /\/api\/v1\/tasks\//.test(r.url()),
  )
  await page.getByLabel('Plan', { exact: true }).fill(runnerDay())
  await page.getByRole('button', { name: 'Save' }).click()
  await saved

  // The mirror of the test above. The runner's today is NOT the account's today, so it is either
  // the day before or the day after -- and which one decides what the page may say.
  //
  // NOT "the task does not appear": a scheduled day that has passed is deliberately CARRIED OVER
  // into today's list rather than dropped, so the row shows -- marked. The mark is the assertion
  // worth having, because 'yesterday' is a word only the account's zone can produce.
  await page.getByRole('link', { name: 'Today' }).click()
  const row = page.getByRole('listitem').filter({ hasText: '按进程时区排的' })
  if (dayIn(ACCOUNT_TZ) > runnerDay()) {
    await expect(row).toBeVisible()
    // Carried, and the day it was planned for is the account's yesterday -- a day only the
    // account's zone can name.
    const [, m, d] = runnerDay().split('-').map(Number) as [number, number, number]
    await expect(row.locator('[data-date-hint="carried"]')).toHaveText(
      `Carried over from ${MONTHS[m - 1]} ${d}`,
    )
  } else {
    // The account is behind the runner, so this day has not arrived yet for the account and
    // nothing may surface it as due now.
    await expect(row).toHaveCount(0)
  }
})

/**
 * The instant whose wall-clock time in `tz` is `day` at `hhmm`. Both zones here are fixed-offset,
 * so the one-step offset correction is exact; it would need a second pass on a DST boundary.
 */
function instantAt(day: string, hhmm: string, tz: string): Date {
  const guess = new Date(`${day}T${hhmm}:00Z`)
  const offset =
    new Date(guess.toLocaleString('en-US', { timeZone: tz })).getTime() -
    new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' })).getTime()
  return new Date(guess.getTime() - offset)
}

test('a deadline inside the account day counts as today on another UTC date', async ({ page }) => {
  await registerFreshUser(page)

  // THE SHARP INSTANT: inside the account's today, but on a different UTC calendar day than now.
  // The account's day always straddles a UTC midnight when the two zones differ, so one of its two
  // ends is always on the far side of it -- whichever end that is depends on which way the account
  // leans, so both are offered and the one that qualifies is used.
  const day = dayIn(ACCOUNT_TZ)
  const utcDay = (d: Date) => d.toISOString().slice(0, 10)
  const due = [instantAt(day, '23:30', ACCOUNT_TZ), instantAt(day, '00:30', ACCOUNT_TZ)].find(
    (d) => utcDay(d) !== utcDay(new Date()),
  )!
  expect(utcDay(due), 'the instant must land on another UTC day').not.toBe(utcDay(new Date()))

  const project = await page.request.post('/api/v1/projects', {
    headers: WEB,
    data: { name: 'Time zone' },
  })
  const made = await page.request.post('/api/v1/tasks', {
    headers: WEB,
    data: { projectId: (await project.json()).id, title: '今天之内截止', parentId: null },
  })
  const patched = await page.request.patch(`/api/v1/tasks/${(await made.json()).id}`, {
    headers: WEB,
    data: { dueAt: due.toISOString() },
  })
  expect(patched.ok()).toBe(true)

  // A fresh load, not a click: the three writes above went straight to the API, behind the app's
  // back, so the today list cached at registration knows nothing about them.
  const listed = page.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      new URL(r.url()).pathname === '/api/v1/tasks' &&
      new URL(r.url()).searchParams.get('view') === 'today',
  )
  await page.goto('/tasks/today')
  await listed

  // The server picks the segment by comparing this instant against the account day's bounds. A
  // server that built those bounds from its OWN zone puts the task on the wrong day, which is the
  // regression this file exists for -- and the one the rest of the suite cannot see.
  await expect(
    page.getByRole('region', { name: 'Today', exact: true }).getByText('今天之内截止'),
  ).toBeVisible()
})
