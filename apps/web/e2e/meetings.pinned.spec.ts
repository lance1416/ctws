import { expect, test, type Page } from '@playwright/test'
import { apiPost, registerFreshUser, WEB } from './helpers'

/**
 * MEETINGS NOT TODAY (FR-066 to FR-069), on the server pinned at Thursday, October 22, 2026, 00:30
 * UTC (01:30 in London, pinned.ts): what the overview owes, which occurrence a page opens on, what
 * a page says about when and who, how far an edit reaches, and how a big meeting and a long series
 * are folded. Every day below is fixed against that instant, so the answers hold whenever the
 * suite runs.
 */
test.use({ timezoneId: 'Europe/London' })

const LONDON = 'Europe/London'
const title = (page: Page) => page.getByRole('main').getByRole('heading', { level: 1 })
const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Meetings' })
const profile = (page: Page) => page.getByRole('complementary', { name: 'Profile' })

const meet = (page: Page, data: Record<string, unknown>) =>
  apiPost<{ meetingId: string; recurrenceId: string }>(page, '/meetings', {
    timeZone: LONDON,
    durationMinutes: 30,
    ...data,
  })

/** Notes hung on one occurrence, as the page writes them (FR-067). */
const note = (page: Page, meetingId: string, occurrenceId: string, body: string) =>
  apiPost(page, '/notes', { body, anchor: { type: 'meeting', id: meetingId, occurrenceId } })

/** One occurrence as the server holds it, or null when there is none. */
async function occurrence(page: Page, meetingId: string, at: string) {
  const res = await page.request.get(`/api/v1/meetings/${meetingId}/occurrences/${at}`, {
    headers: WEB,
  })
  return res.ok() ? ((await res.json()) as { title: string; startsLocal: string }) : null
}

/** Every occurrence on `day`, as [title, start]. */
async function heldOn(page: Page, day: string) {
  const res = await page.request.get(`/api/v1/meetings?from=${day}&to=${day}`, { headers: WEB })
  return ((await res.json()) as { meetings: { title: string; startsLocal: string }[] }).meetings
    .map((m) => [m.title, m.startsLocal])
    .sort()
}

test('a project’s meetings say a day in the week by its name, and one further off by its date', async ({
  page,
}) => {
  await registerFreshUser(page)
  const project = await apiPost(page, '/projects', { name: 'Job hunt' })
  // Saturday the 24th, this week; Friday, November 20, four weeks on.
  await meet(page, {
    title: 'Phone screen',
    startsLocal: '2026-10-24T10:00',
    projectId: project.id,
  })
  await meet(page, { title: 'Onsite', startsLocal: '2026-11-20T10:00', projectId: project.id })
  await page.goto(`/projects/${project.id}`)
  const block = page.getByRole('region', { name: 'Meetings' })
  await expect(block.locator('[data-linked]').filter({ hasText: 'Phone screen' })).toContainText(
    'Sat 10:00',
  )
  // BUG-038: not "Fri 10:00", which would read as this week's Friday.
  await expect(block.locator('[data-linked]').filter({ hasText: 'Onsite' })).toContainText(
    'Nov 20 10:00',
  )
})

test('a past occurrence opens as itself, not as the next one', async ({ page }) => {
  await registerFreshUser(page)
  // Weekly on Thursdays from the 8th: the 8th and the 15th are over, today's is still to come.
  await meet(page, {
    title: 'Standing call',
    startsLocal: '2026-10-08T09:00',
    rrule: 'FREQ=WEEKLY;BYDAY=TH',
  })
  await page.goto('/meetings')
  // Past shows each series' latest occurrence held: last week's.
  await sidebar(page)
    .getByRole('region', { name: 'Past' })
    .getByRole('link', { name: /Standing call/ })
    .click()
  await expect(page).toHaveURL(/at=2026-10-15T09(%3A|:)00/)
  // This year's day, so said without its year.
  const head = page.getByRole('main').getByText('Thu, Oct 15', { exact: true }).first()
  await expect(head).toBeVisible()
  await expect(page.getByRole('main')).not.toContainText('Oct 15, 2026')
})

test('a series in the sidebar is at its next occurrence, not one already over', async ({
  page,
}) => {
  await registerFreshUser(page)
  // Daily at midnight for a quarter of an hour: today's was over at 00:15, before the pinned 01:30.
  await meet(page, {
    title: 'Midnight check',
    startsLocal: '2026-10-20T00:00',
    durationMinutes: 15,
    rrule: 'FREQ=DAILY',
  })
  await page.goto('/meetings')
  const row = sidebar(page)
    .getByRole('region', { name: 'Coming' })
    .getByRole('link', { name: /Midnight check/ })
  await expect(row).toHaveCount(1)
  await expect(row).toHaveAttribute('href', /at=2026-10-23T00(%3A|:)00/)
  await expect(row).toContainText('Fri')
})

test('a link to a meeting more than a year off still opens it', async ({ page }) => {
  await registerFreshUser(page)
  // Each beyond the year either side of the 22nd that the next and the latest are looked for in.
  const ahead = await meet(page, {
    title: 'Far ahead',
    startsLocal: '2028-03-14T18:00',
    durationMinutes: 60,
  })
  const behind = await meet(page, {
    title: 'Long ago',
    startsLocal: '2024-03-14T18:00',
    durationMinutes: 60,
  })
  // A weekly series that starts that far ahead opens its first occurrence: its next.
  const series = await meet(page, {
    title: 'Starts later',
    startsLocal: '2028-03-16T09:00',
    rrule: 'FREQ=WEEKLY;BYDAY=TH',
  })

  const opens = async (id: string, name: string, day: string, time: string) => {
    await page.goto(`/meetings/${id}`)
    await expect(title(page)).toHaveText(name)
    await expect(page.getByRole('main').getByText(day, { exact: true }).first()).toBeVisible()
    await expect(profile(page).getByRole('region', { name: 'When' })).toContainText(time)
  }
  await opens(ahead.meetingId, 'Far ahead', 'Tue, Mar 14, 2028', '18:00 to 19:00')
  await opens(behind.meetingId, 'Long ago', 'Thu, Mar 14, 2024', '18:00 to 19:00')
  await opens(series.meetingId, 'Starts later', 'Thu, Mar 16, 2028', '09:00 to 09:30')
})

/** FR-066. */
test('the overview says what is coming and which notes are still to write, a press from each', async ({
  page,
}) => {
  await registerFreshUser(page)
  // Held on Tuesday the 20th, nothing written; Friday the 23rd still to come; and one held a month
  // ago, past the two weeks Notes to write looks back.
  const retro = await meet(page, { title: 'Retro', startsLocal: '2026-10-20T10:00' })
  await meet(page, { title: 'Design review', startsLocal: '2026-10-23T15:00' })
  await meet(page, { title: 'Kick-off', startsLocal: '2026-09-22T10:00' })
  await page.goto('/meetings')
  await expect(page.getByRole('heading', { level: 1, name: 'Meetings' })).toBeVisible()
  await expect(page.getByRole('main').getByRole('button', { name: 'New meeting' })).toBeVisible()

  const next = page.getByRole('region', { name: 'The next 7 days' })
  await expect(next.locator('[data-next-meeting]')).toHaveCount(1)
  await expect(next.locator('[data-next-meeting]')).toContainText('Fri')
  await expect(next.locator('[data-next-meeting]')).toContainText('15:00')
  await expect(next.locator('[data-next-meeting]')).toContainText('Design review')

  const toWrite = page.getByRole('region', { name: 'Notes to write' })
  await expect(toWrite.locator('[data-to-write]')).toHaveCount(1)
  await expect(toWrite.locator('[data-to-write]')).toContainText('Oct 20')
  await toWrite.getByRole('link', { name: /^Write the notes for Retro/ }).click()

  // Straight into that occurrence's notes, the cursor in the box.
  await expect(page).toHaveURL(
    new RegExp(`/meetings/${retro.meetingId}\\?at=2026-10-20T10(%3A|:)00&write=1`),
  )
  const box = page.getByRole('textbox', { name: 'Notes for this meeting' })
  await expect(box).toBeFocused()
  const saved = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/api\/v1\/notes$/.test(r.url()) && r.ok(),
  )
  // Saved as it is typed: no Save to press.
  await box.pressSequentially('Shipping moves to Monday.')
  const body = (await saved).request().postDataJSON() as Record<string, unknown>
  expect(body.anchor).toEqual({
    type: 'meeting',
    id: retro.meetingId,
    occurrenceId: '2026-10-20T10:00',
  })

  // Written, it is no longer one to write.
  await page.goto('/meetings')
  await expect(page.getByRole('region', { name: 'Notes to write' })).toContainText('None')
  await expect(page.locator('[data-to-write]')).toHaveCount(0)
})

/** FR-067. */
test('a meeting’s page says when on your clock and theirs, and what was said before', async ({
  page,
}) => {
  await registerFreshUser(page)
  const wen = await apiPost(page, '/people', {
    givenName: 'Wen',
    familyName: 'Li',
    timeZone: 'Asia/Shanghai',
  })
  const here = await apiPost(page, '/people', { givenName: 'Tom', timeZone: LONDON })
  // Weekly on Thursdays since the 1st; today's, the 22nd, is the one opened.
  const m = await meet(page, {
    title: 'Weekly sync',
    startsLocal: '2026-10-01T10:00',
    durationMinutes: 60,
    rrule: 'FREQ=WEEKLY;BYDAY=TH',
    attendeeIds: [wen.id, here.id],
  })
  await note(page, m.meetingId, '2026-10-08T10:00', 'Agreed the roadmap.')
  await page.goto(`/meetings/${m.meetingId}?at=2026-10-22T10:00`)
  await expect(title(page)).toHaveText('Weekly sync')

  // 10:00 in London is 17:00 in Shanghai on the 22nd (BST, UTC+1). Tom keeps your clock, so no line.
  const when = profile(page).getByRole('region', { name: 'When' })
  await expect(when).toContainText('10:00 to 11:00')
  await expect(when).toContainText(LONDON)
  await expect(when).toContainText('17:00 to 18:00')
  await expect(when).toContainText('Shanghai, for Wen')
  await expect(when).not.toContainText('for Tom')

  // You first, then who else is in it.
  const attending = profile(page).getByRole('region', { name: 'Attending' })
  await expect(attending.getByRole('listitem').first()).toContainText('You')
  await expect(attending).toContainText('Wen Li')

  // The latest first; the first one held, with nothing written, says so.
  const earlier = page.getByRole('region', { name: 'Earlier in this series' })
  await expect(earlier.locator('[data-earlier]')).toHaveCount(3)
  expect(
    await earlier
      .locator('[data-earlier]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-earlier'))),
  ).toEqual(['2026-10-15T10:00', '2026-10-08T10:00', '2026-10-01T10:00'])
  await expect(earlier.locator('[data-earlier]').nth(0)).toContainText('No notes')
  await expect(earlier.locator('[data-earlier]').nth(1)).toContainText('Agreed the roadmap.')
  await expect(earlier.locator('[data-earlier]').nth(2)).toContainText('First meeting, no notes')
})

/** FR-068. */
test('Edit on a repeating meeting asks which; from this one on leaves the earlier ones', async ({
  page,
}) => {
  await registerFreshUser(page)
  const m = await meet(page, {
    title: 'Weekly sync',
    startsLocal: '2026-10-01T10:00',
    rrule: 'FREQ=WEEKLY;BYDAY=TH',
  })
  await page.goto(`/meetings/${m.meetingId}?at=2026-10-29T10:00`)
  await page.getByRole('main').getByRole('button', { name: 'Edit', exact: true }).click()
  const ask = page.getByRole('dialog', { name: 'This meeting repeats. Change which?' })
  // Three answers, each saying what it reaches.
  await expect(ask.getByRole('radio')).toHaveCount(3)
  await expect(ask.getByRole('radio', { name: /^Only this one/ })).toBeChecked()
  await expect(ask).toContainText('Thu, Oct 29')
  await expect(ask).toContainText('Earlier ones stay as they were')
  await expect(ask).toContainText('Since Oct 1')
  await ask.getByRole('radio', { name: /^This one and every one after/ }).check()
  await ask.getByRole('button', { name: 'Edit', exact: true }).click()

  await expect(page).toHaveURL(/\/edit\?.*scope=following/)
  await expect(title(page)).toHaveText('Edit Weekly sync')
  await expect(page.getByText('Changing: This one and every one after')).toBeVisible()
  await page.getByLabel('Start', { exact: true }).fill('2026-10-29T11:00')
  await page.getByRole('button', { name: /^Save/ }).click()
  await expect(page).not.toHaveURL(/\/edit/)

  // That one and the ones after moved; the 22nd, before it, did not.
  expect(await heldOn(page, '2026-10-22')).toEqual([['Weekly sync', '2026-10-22T10:00']])
  expect(await heldOn(page, '2026-10-29')).toEqual([['Weekly sync', '2026-10-29T11:00']])
  expect(await heldOn(page, '2026-11-05')).toEqual([['Weekly sync', '2026-11-05T11:00']])
  // And the page is on the one moved, at its new time.
  await expect(page).toHaveURL(/at=2026-10-29T11(%3A|:)00/)
  await expect(title(page)).toHaveText('Weekly sync')
})

/** FR-068. */
test('one occurrence cancelled from More can be taken back', async ({ page }) => {
  await registerFreshUser(page)
  const m = await meet(page, {
    title: 'Weekly sync',
    startsLocal: '2026-10-01T10:00',
    rrule: 'FREQ=WEEKLY;BYDAY=TH',
  })
  await page.goto(`/meetings/${m.meetingId}?at=2026-10-29T10:00`)
  await page.getByRole('main').getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Cancel this one' }).click()

  await expect(page.getByRole('heading', { name: 'This one is cancelled' })).toBeVisible()
  expect(await heldOn(page, '2026-10-29')).toEqual([])
  // Only that one: the week after is still on.
  expect(await heldOn(page, '2026-11-05')).toEqual([['Weekly sync', '2026-11-05T10:00']])

  // Left and opened again by its own address, it is still cancelled, not gone (BUG-051).
  const own = new URL(page.url())
  own.searchParams.delete('cancelled')
  await page.goto('/meetings')
  await page.goto(own.pathname + own.search)
  await expect(page.getByRole('heading', { name: 'This one is cancelled' })).toBeVisible()
  await expect(page.getByText('This meeting was deleted')).toHaveCount(0)

  await page.getByRole('button', { name: 'Take it back' }).click()
  await expect(title(page)).toHaveText('Weekly sync')
  await expect(page).toHaveURL(/at=2026-10-29T10(%3A|:)00/)
  expect(await heldOn(page, '2026-10-29')).toEqual([['Weekly sync', '2026-10-29T10:00']])
})

/** FR-068, FR-035. */
test('Delete this meeting, at the edit page’s foot, removes the whole series', async ({ page }) => {
  await registerFreshUser(page)
  const m = await meet(page, {
    title: 'Weekly sync',
    startsLocal: '2026-10-01T10:00',
    rrule: 'FREQ=WEEKLY;BYDAY=TH',
  })
  await page.goto(`/meetings/${m.meetingId}?at=2026-10-29T10:00`)
  await page.getByRole('main').getByRole('button', { name: 'Edit', exact: true }).click()
  // Whichever reach was chosen, the foot deletes the series.
  await page
    .getByRole('dialog', { name: 'This meeting repeats. Change which?' })
    .getByRole('button', { name: 'Edit', exact: true })
    .click()
  const zone = page.locator('main [data-stop-zone]')
  await zone.getByRole('button', { name: 'Delete this meeting' }).click()
  const ask = page.getByRole('alertdialog')
  // Three Thursdays held before the pinned day, 10-22 (FR-035).
  await expect(ask).toContainText(
    'Delete Weekly sync? The series goes, with the 3 meetings already held. Their notes stay, as notes on their own.',
  )
  await ask.getByRole('button', { name: 'Delete this meeting' }).click()

  await expect(page).toHaveURL(/\/meetings$/)
  expect(await occurrence(page, m.meetingId, '2026-10-01T10:00')).toBeNull()
  expect(await heldOn(page, '2026-10-15')).toEqual([])
  expect(await heldOn(page, '2026-11-05')).toEqual([])
})

/** FR-069. */
test('a big meeting is a row of faces counted by organisation, and All opens everyone', async ({
  page,
}) => {
  await registerFreshUser(page)
  const acme = await apiPost(page, '/organisations', { name: 'Acme' })
  const globex = await apiPost(page, '/organisations', { name: 'Globex' })
  const names = [
    '李雯',
    'Ana Silva',
    'Ben Okafor',
    'Chloe Martin',
    'Dev Patel',
    'Eva Novak',
    'Femi Ade',
    'Gil Cohen',
    'Hana Sato',
    'Ivan Petrov',
    'Jae Kim',
    'Kofi Mensah',
    'Lena Vogel',
    'Mo Farah',
  ]
  const ids: string[] = []
  for (const [i, name] of names.entries()) {
    const p = await apiPost(page, '/people', { name })
    ids.push(p.id)
    // Six at Acme, four at Globex, the rest nowhere on record.
    const org = i < 6 ? acme : i < 10 ? globex : null
    if (org) {
      const res = await page.request.put(`/api/v1/people/${p.id}/roles`, {
        headers: WEB,
        data: { roles: [{ organisationId: org.id, title: 'Engineer' }] },
      })
      expect(res.ok(), await res.text()).toBe(true)
    }
  }
  const m = await meet(page, {
    title: 'All hands',
    startsLocal: '2026-10-23T16:00',
    attendeeIds: ids,
  })
  await page.goto(`/meetings/${m.meetingId}`)
  const attending = profile(page).getByRole('region', { name: 'Attending' })
  // Fourteen and you: seven faces, and the rest counted.
  await expect(attending.getByLabel('15 people')).toContainText('+7')
  const count = (org: string) => attending.getByRole('listitem').filter({ hasText: org })
  await expect(count('Acme')).toContainText('6')
  await expect(count('Globex')).toContainText('4')
  await expect(count('Others')).toContainText('4')

  await attending.getByRole('button', { name: 'All 15' }).click()
  const panel = page.getByRole('dialog', { name: 'Attending' })
  await expect(panel).toBeVisible()
  const find = panel.getByRole('searchbox', { name: 'Find a person' })
  await find.fill('李')
  await expect(panel.getByRole('link')).toHaveCount(1)
  await expect(panel.getByRole('link')).toContainText('李雯')
  await expect(panel.getByRole('region', { name: 'Acme' })).toContainText('Engineer')
})

/** FR-069. */
test('a long note folds to its first screen, and Read all unfolds it', async ({ page }) => {
  await registerFreshUser(page)
  const m = await meet(page, { title: 'Planning', startsLocal: '2026-10-20T10:00' })
  const paragraph =
    'We went through the launch plan line by line, agreed who owns each part, and wrote down ' +
    'what is still open so that nothing is lost between now and the next meeting.'
  await note(
    page,
    m.meetingId,
    '2026-10-20T10:00',
    ['# Decisions', ...Array.from({ length: 12 }, () => paragraph)].join('\n\n'),
  )
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/meetings/${m.meetingId}?at=2026-10-20T10:00`)
  const notes = page.getByRole('region', { name: 'Notes', exact: true })
  const body = notes.locator('[data-note-body]')
  await expect(body).toContainText('launch plan')
  // Its headings are a little contents at the block's head; a narrower block keeps them in a
  // menu, so the head stays one line (K-04).
  await expect(notes.getByRole('button', { name: 'Decisions' })).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(notes.getByRole('button', { name: 'Decisions' })).toBeHidden()
  await notes.getByRole('button', { name: 'Go to a heading' }).click()
  await expect(page.getByRole('menuitem', { name: 'Decisions' })).toBeVisible()
  await page.keyboard.press('Escape')
  expect((await body.boundingBox())!.height).toBeLessThanOrEqual(301)
  await notes.getByRole('button', { name: 'Read all' }).click()
  await expect(notes.getByRole('button', { name: 'Fold' })).toBeVisible()
  expect((await body.boundingBox())!.height).toBeGreaterThan(301)
})

/** FR-069. */
test('a long series shows its three latest, and the rest in the sidebar by month', async ({
  page,
}) => {
  await registerFreshUser(page)
  // Thursdays from August 20: nine before the 22nd.
  const m = await meet(page, {
    title: 'Weekly sync',
    startsLocal: '2026-08-20T10:00',
    rrule: 'FREQ=WEEKLY;BYDAY=TH',
  })
  await note(page, m.meetingId, '2026-09-03T10:00', 'The budget was signed off.')
  await page.goto(`/meetings/${m.meetingId}?at=2026-10-22T10:00`)
  const earlier = page.getByRole('region', { name: 'Earlier in this series' })
  await expect(earlier.locator('[data-earlier]')).toHaveCount(3)

  // Its search looks through every note of the series, not just the three shown.
  await earlier.getByRole('searchbox', { name: 'Search these notes' }).fill('budget')
  await expect(earlier.locator('[data-earlier]')).toHaveCount(1)
  await expect(earlier.locator('[data-earlier]')).toHaveAttribute(
    'data-earlier',
    '2026-09-03T10:00',
  )
  await earlier.getByRole('searchbox', { name: 'Search these notes' }).fill('')

  await earlier.getByRole('link', { name: 'All 9 earlier meetings' }).click()
  await expect(page).toHaveURL(/list=series/)
  const series = page.getByRole('navigation', { name: 'Weekly sync series' })
  for (const month of ['August', 'September', 'October'])
    await expect(series.getByRole('region', { name: month })).toBeVisible()
  await expect(series.getByRole('region', { name: 'August' }).getByRole('link')).toHaveCount(2)
  await expect(series).toContainText('The budget was signed off.')
  await series.getByRole('link', { name: 'All meetings' }).click()
  await expect(sidebar(page).getByRole('region', { name: 'Coming' })).toBeVisible()
})

test('the workbench says a meeting past this week by its date, not a weekday', async ({ page }) => {
  await registerFreshUser(page, '/')
  // The pinned now is Thursday the 22nd: Saturday is this week, the Friday after is not.
  await meet(page, { title: 'Design review', startsLocal: '2026-10-23T15:00' })
  await meet(page, { title: 'Climbing', startsLocal: '2026-10-24T10:00' })
  await meet(page, { title: 'Quarterly', startsLocal: '2026-10-30T10:00' })
  await page.reload()
  const rows = page.locator('[data-next-meeting]')
  await expect(rows.filter({ hasText: 'Climbing' })).toContainText('Sat')
  await expect(rows.filter({ hasText: 'Quarterly' })).toContainText('Oct 30')
  await expect(rows.filter({ hasText: 'Quarterly' })).not.toContainText('Fri')
})
