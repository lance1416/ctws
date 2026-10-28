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
