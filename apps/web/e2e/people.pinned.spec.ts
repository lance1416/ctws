import { expect, test, type Page } from '@playwright/test'
import { apiPost, pickLunarDay, registerFreshUser } from './helpers'

/**
 * WHO YOU WERE IN TOUCH WITH (FR-060, artboard 18), on the server pinned at Thursday, October 22,
 * 2026, 00:30 UTC (pinned.ts): the last 30 days, the latest first, each with how it went and the
 * day; and those 90 days or more ago, with how long it has been.
 */
test.use({ timezoneId: 'Europe/London' })

const message = (page: Page, personId: string, direction: string, occurredAt: string) =>
  apiPost(page, '/communication', {
    direction,
    channel: 'email',
    occurredAt,
    parties: [{ type: 'person', id: personId }],
  })

test('the overview says who you were in touch with lately, and with whom it has been a while', async ({
  page,
}) => {
  await registerFreshUser(page)
  const sarah = await apiPost(page, '/people', { name: 'Sarah Whitfield' })
  const priya = await apiPost(page, '/people', { name: 'Priya Nair' })
  const mira = await apiPost(page, '/people', { name: 'Mira Chen' })
  const tom = await apiPost(page, '/people', { name: 'Tom Okafor' })
  const james = await apiPost(page, '/people', { name: 'James Ward' })
  // 23:50 UTC on the 21st is already the 22nd in London: today on the account's calendar.
  await message(page, sarah.id, 'sent', '2026-10-21T23:50:00Z')
  await message(page, priya.id, 'received', '2026-10-16T08:00:00Z')
  await apiPost(page, '/meetings', {
    title: 'Coffee',
    startsLocal: '2026-10-15T15:00',
    timeZone: 'Europe/London',
    durationMinutes: 30,
    attendeeIds: [mira.id],
  })
  await message(page, tom.id, 'sent', '2026-06-20T10:00:00Z')
  await message(page, james.id, 'received', '2026-03-10T10:00:00Z')
  await page.goto('/people')

  const lately = page.getByRole('region', { name: 'Recently in touch' })
  await expect(lately.getByRole('listitem')).toHaveText([
    /Sarah Whitfield\s*Message sent\s*Today/,
    /Priya Nair\s*Message received\s*Oct 16/,
    /Mira Chen\s*Met\s*Oct 15/,
  ])
  const quiet = page.getByRole('region', { name: 'Not in touch for a while' })
  await expect(quiet.getByRole('listitem')).toHaveText([
    /Tom Okafor\s*4 months/,
    /James Ward\s*7 months/,
  ])
  // A row is the way to the person.
  await quiet.getByRole('link', { name: /Tom Okafor/ }).click()
  await expect(page).toHaveURL(new RegExp(`/people/${tom.id}$`))
})

test('their Meetings block has what is coming, then what was held, however long ago (BUG-046)', async ({
  page,
}) => {
  await registerFreshUser(page)
  const mira = await apiPost(page, '/people', { name: 'Mira Chen' })
  const meeting = (title: string, startsLocal: string, rule?: string) =>
    apiPost(page, '/meetings', {
      title,
      startsLocal,
      timeZone: 'Europe/London',
      durationMinutes: 30,
      attendeeIds: [mira.id],
      ...(rule ? { rrule: rule } : {}),
    })
  // Weekly on Fridays since October 2: held on the 16th, next on the 23rd.
  await meeting('rust-analyzer sync', '2026-10-02T10:30', 'FREQ=WEEKLY')
  await meeting('Payments platform review', '2022-03-03T14:00')
  await meeting('Stripe phone screen', '2026-10-22T14:00')
  await page.goto(`/people/${mira.id as string}`)

  const rows = page.getByRole('region', { name: 'Meetings' }).locator('[data-linked]')
  await expect(rows).toHaveText([
    /Thu 14:00\s*Stripe phone screen/,
    /Fri 10:30\s*rust-analyzer sync/,
    /Fri 10:30\s*rust-analyzer sync/,
    /Mar 3, 2022 14:00\s*Payments platform review/,
  ])

  // Side by side, the full blocks are as tall as each other (FR-011 rule 1, BUG-047).
  const project = await apiPost(page, '/projects', { name: 'Job hunt' })
  const task = await apiPost(page, '/tasks', { projectId: project.id, title: 'Send the CV' })
  await apiPost(page, '/relations', {
    from: { type: 'task', id: task.id },
    to: { type: 'person', id: mira.id },
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.reload()
  const tasks = page.getByRole('region', { name: 'Tasks' })
  await expect(tasks).toContainText('Send the CV')
  const meetingsBox = await page.getByRole('region', { name: 'Meetings' }).boundingBox()
  const tasksBox = await tasks.boundingBox()
  expect(tasksBox!.y).toBe(meetingsBox!.y)
  expect(tasksBox!.height).toBe(meetingsBox!.height)
})

test('a birthday picked says this year’s day by its weekday, and when the reminder comes (BUG-050)', async ({
  page,
}) => {
  await registerFreshUser(page)
  await page.goto('/people/new')
  await page
    .getByRole('radiogroup', { name: 'Which calendar' })
    .getByRole('radio', { name: 'Lunar' })
    .click()
  await pickLunarDay(page, '九月', '廿六')
  const block = page.getByRole('region', { name: 'Birthday' })
  await expect(block).toContainText('Every year on九月廿六')
  // Thursday the 22nd: this year's 九月廿六 is Wednesday, November 4 (FR-062).
  await expect(page.getByTestId('birthday-preview')).toContainText('Wednesday, Nov 4')
  await expect(block.getByRole('button', { name: /^Tell me/ })).toBeVisible()
  await expect(block).toContainText('At 00:00 their time')
  await block.getByRole('button', { name: /^Tell me/ }).click()
  await expect(page.getByRole('menuitem')).toHaveText([
    /On the day/,
    /A day before/,
    /3 days before/,
    /A week before/,
  ])
})
