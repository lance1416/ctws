import { expect, test } from '@playwright/test'
import { dayOffset } from './days'
import { apiPost, makeProject, registerFreshUser } from './helpers'

/**
 * THE INSPECTOR'S NARROW PAGES (FR-022, artboard 33). A thing linked from a page opens beside it,
 * and the page stays put; a thing clicked in the inspector takes its place, with a way back.
 */
test.use({ timezoneId: 'Europe/London', viewport: { width: 1440, height: 900 } })

test("Mira's meeting opens beside her page; an attendee takes its place; back, reload, full page", async ({
  page,
}) => {
  await registerFreshUser(page, '/')
  const project = await makeProject(page, 'Job hunt')
  const mira = await apiPost(page, '/people', { givenName: 'Mira', familyName: 'Chen' })
  const priya = await apiPost(page, '/people', { givenName: 'Priya', familyName: 'Nair' })
  await apiPost(page, '/meetings', {
    title: 'Stripe: first screen',
    startsLocal: `${dayOffset(2)}T14:00`,
    timeZone: 'Europe/London',
    durationMinutes: 45,
    joinUrl: 'https://meet.google.com/abc-defg-hij',
    projectId: project,
    attendeeIds: [mira.id, priya.id],
  })
  await page.goto(`/people/${mira.id}`)

  await page
    .getByRole('region', { name: 'Meetings' })
    .getByRole('link', { name: /Stripe/ })
    .click()
  const inspector = page.getByRole('complementary', { name: 'Inspector' })
  await expect(inspector.getByRole('heading', { name: 'Stripe: first screen' })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/people/${mira.id}\\?inspect=meeting`))
  await expect(inspector.getByRole('link', { name: 'Join Stripe: first screen' })).toBeVisible()

  await inspector.getByRole('button', { name: 'Priya Nair' }).click()
  await expect(inspector.getByRole('heading', { name: 'Priya Nair' })).toBeVisible()
  await inspector.getByRole('button', { name: 'Stripe: first screen' }).first().click()
  await expect(inspector.getByRole('heading', { name: 'Stripe: first screen' })).toBeVisible()

  await inspector.getByRole('button', { name: 'Priya Nair' }).click()
  await expect(inspector.getByRole('heading', { name: 'Priya Nair' })).toBeVisible()
  await page.keyboard.press('Alt+ArrowLeft')
  await expect(inspector.getByRole('heading', { name: 'Stripe: first screen' })).toBeVisible()

  // The address keeps only what is shown: a reload keeps it open, with no way back.
  await page.reload()
  await expect(inspector.getByRole('heading', { name: 'Stripe: first screen' })).toBeVisible()
  await expect(inspector.getByTitle('Back  Alt ←')).toHaveCount(0)

  await inspector.getByRole('button', { name: 'Open full page' }).click()
  await expect(page).toHaveURL(/\/meetings\//)
  await expect(inspector).toHaveCount(0)
})

test('Esc closes it and focus goes back to what opened it', async ({ page }) => {
  await registerFreshUser(page, '/')
  const mira = await apiPost(page, '/people', { givenName: 'Mira', familyName: 'Chen' })
  await apiPost(page, '/meetings', {
    title: 'Coffee',
    startsLocal: `${dayOffset(1)}T10:00`,
    timeZone: 'Europe/London',
    durationMinutes: 30,
    attendeeIds: [mira.id],
  })
  await page.goto(`/people/${mira.id}`)
  const row = page.getByRole('region', { name: 'Meetings' }).getByRole('link', { name: /Coffee/ })
  await row.click()
  const inspector = page.getByRole('complementary', { name: 'Inspector' })
  await expect(inspector.getByRole('heading', { name: 'Coffee' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(inspector).toHaveCount(0)
  await expect(row).toBeFocused()
})

test('the workbench opens a meeting beside it, as the occurrence; its notes are said by name', async ({
  page,
}) => {
  await registerFreshUser(page, '/')
  const m = await apiPost<{ meetingId: string; recurrenceId: string }>(page, '/meetings', {
    title: 'Stripe: first screen',
    startsLocal: `${dayOffset(1)}T14:00`,
    timeZone: 'Europe/London',
    durationMinutes: 45,
  })
  await apiPost(page, '/notes', {
    body: '## Updates\n- Billing service in staging.',
    anchor: { type: 'meeting', id: m.meetingId, occurrenceId: m.recurrenceId },
  })
  await page.reload()
  const inspector = page.getByRole('complementary', { name: 'Inspector' })
  const at = new RegExp(`\\?inspect=meeting(:|%3A)${m.meetingId}(@|%40)`)

  // Next meetings: the page stays the workbench (FR-022).
  await page
    .locator('[data-next-meeting-card]')
    .getByRole('link', { name: 'Stripe: first screen' })
    .click()
  await expect(inspector.getByRole('heading', { name: 'Stripe: first screen' })).toBeVisible()
  await expect(page).toHaveURL(at)
  // A note in the timeline by its name, not its markdown (I-01).
  const timeline = inspector.getByRole('region', { name: 'Timeline' }).first()
  await expect(timeline).toContainText('Wrote notes')
  await expect(timeline).toContainText('Updates')
  await expect(timeline).not.toContainText('##')
  await page.keyboard.press('Escape')
  await expect(inspector).toHaveCount(0)

  // Next seven days, the same.
  await page.locator('[data-week-entry="occurrence"]').first().click()
  await expect(inspector.getByRole('heading', { name: 'Stripe: first screen' })).toBeVisible()
  await expect(page).toHaveURL(at)
})

test('a message’s Edit takes it to its page with the editor open', async ({ page }) => {
  await registerFreshUser(page, '/')
  const priya = await apiPost(page, '/people', { givenName: 'Priya', familyName: 'Nair' })
  const message = await apiPost(page, '/communication', {
    parties: [{ type: 'person', id: priya.id }],
    direction: 'sent',
    channel: 'email',
    subject: 'Enquiry',
    occurredAt: new Date().toISOString(),
  })
  await page.goto(`/?inspect=communication:${message.id}`)
  const inspector = page.getByRole('complementary', { name: 'Inspector' })
  await expect(inspector.getByRole('heading', { name: 'Enquiry' })).toBeVisible()
  await inspector.getByRole('button', { name: 'Edit' }).click()
  await expect(page).toHaveURL(new RegExp(`/communication/${message.id}\\?edit=1$`))
  await expect(inspector).toHaveCount(0)
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`/communication/${message.id}$`))
})

test('/meetings/new names no meeting, and goes to the meetings', async ({ page }) => {
  await registerFreshUser(page, '/meetings/new')
  await expect(page).toHaveURL(/\/meetings$/)
})

test('a block past five says All N, which lists the whole of it beside the page', async ({
  page,
}) => {
  await registerFreshUser(page, '/')
  const mira = await apiPost(page, '/people', { givenName: 'Mira', familyName: 'Chen' })
  for (let i = 1; i <= 7; i++)
    await apiPost(page, '/meetings', {
      title: `Catch-up ${i}`,
      startsLocal: `${dayOffset(i)}T10:00`,
      timeZone: 'Europe/London',
      durationMinutes: 30,
      attendeeIds: [mira.id],
    })
  await page.goto(`/people/${mira.id}`)
  const meetings = page.getByRole('region', { name: 'Meetings' })
  await expect(meetings.getByRole('link', { name: /Catch-up/ })).toHaveCount(5)
  await meetings.getByRole('button', { name: 'All 7' }).click()
  const inspector = page.getByRole('complementary', { name: 'Inspector' })
  await expect(inspector.getByRole('heading', { name: 'Meetings' })).toBeVisible()
  await expect(inspector.getByRole('listitem')).toHaveCount(7)
  await expect(page).toHaveURL(new RegExp(`/people/${mira.id}\\?inspect=list`))
  // Reloaded, it is still the list.
  await page.reload()
  await expect(inspector.getByRole('listitem')).toHaveCount(7)
})
