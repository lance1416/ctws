import { expect, test, type Page } from '@playwright/test'
import { apiPost, registerFreshUser } from './helpers'

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
