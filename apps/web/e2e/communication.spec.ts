import { expect, test, type Page } from '@playwright/test'
import { apiPost, makeProject, registerFreshUser, WEB } from './helpers'

/**
 * LOGGING A MESSAGE (FR-048, FR-070): from an organisation's page with N X, beside the page;
 * whoever it was with brings their organisation once; it lands on every timeline it belongs on.
 */
async function put(page: Page, path: string, data: object) {
  const res = await page.request.put(`/api/v1${path}`, { headers: WEB, data })
  expect(res.ok(), `${path}: ${res.status()}`).toBe(true)
}

async function harbour(page: Page) {
  await registerFreshUser(page)
  const firm = await apiPost(page, '/organisations', {
    name: 'Harbour & Lane LLP',
    type: 'Law firm',
  })
  const sarah = await apiPost(page, '/people', { givenName: 'Sarah', familyName: 'Whitfield' })
  await put(page, `/people/${sarah.id}/roles`, {
    roles: [{ organisationId: firm.id, title: 'Partner' }],
  })
  const lawyer = await makeProject(page, 'Find a lawyer')
  return { firm, sarah, lawyer }
}

const pane = (page: Page) => page.getByRole('dialog', { name: 'Log a message' })

test('N X on an organisation logs a message to it, and it is on every timeline it belongs on', async ({
  page,
}) => {
  const { firm, sarah, lawyer } = await harbour(page)
  await page.goto(`/organisations/${firm.id as string}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Harbour & Lane LLP' })).toBeVisible()
  await page.keyboard.press('n')
  await page.keyboard.press('x')

  const form = pane(page)
  await expect(form).toBeVisible()
  // Logged from the organisation, it is with the organisation already (FR-070).
  await expect(form.getByRole('button', { name: 'Remove Harbour & Lane LLP' })).toBeVisible()
  await form.getByRole('combobox', { name: 'To' }).fill('sarah')
  await form.getByRole('option', { name: 'Sarah Whitfield' }).click()
  await expect(form.getByRole('button', { name: 'Remove Sarah Whitfield' })).toBeVisible()
  // Her organisation was there already: it is not added twice.
  await expect(form.getByRole('button', { name: 'Remove Harbour & Lane LLP' })).toHaveCount(1)

  await form.getByRole('textbox', { name: 'Subject' }).fill('Signed engagement letter')
  await form.getByRole('textbox', { name: 'What was said' }).fill('Signed and attached.')
  await form.getByRole('button', { name: 'Add a link' }).click()
  await form.getByRole('textbox', { name: 'Link' }).fill('harbour-lane.example/letter.pdf')
  await form.getByRole('textbox', { name: 'Link' }).press('Enter')
  await form
    .getByRole('radiogroup', { name: 'Channel' })
    .getByRole('radio', { name: 'Email' })
    .click()
  // Filed under a project, it is on the project's timeline too.
  await form.getByRole('button', { name: 'Projects: No project' }).click()
  await page.getByRole('menuitemradio', { name: 'Find a lawyer' }).click()
  await form.getByRole('textbox', { name: 'What was said' }).press('Control+Enter')
  await expect(form).toHaveCount(0)

  const first = page
    .getByRole('region', { name: 'Timeline' })
    .locator('[data-timeline-entry]')
    .first()
  await expect(first).toContainText('Signed engagement letter')
  await expect(first).toContainText('To Harbour & Lane LLP, Sarah Whitfield')
  await expect(first.getByRole('link', { name: 'letter.pdf' })).toHaveAttribute(
    'href',
    'https://harbour-lane.example/letter.pdf',
  )
  // Closed, the way to log another is still on the head (FR-011 rule 7).
  await expect(page.getByRole('button', { name: /^Log a message\s*N/ })).toBeVisible()

  await page.goto(`/people/${sarah.id as string}`)
  await expect(page.getByRole('region', { name: 'Timeline' })).toContainText(
    'Signed engagement letter',
  )
  await page.goto('/communication')
  const recent = page
    .getByRole('navigation', { name: 'Communication' })
    .getByRole('region', { name: 'Recent' })
  await recent.getByRole('link', { name: /Signed engagement letter/ }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Signed engagement letter' }),
  ).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: 'Find a lawyer' })).toHaveAttribute(
    'href',
    `/projects/${lawyer}`,
  )
})

test('a message needs someone it was with, and leaving a typed one asks first', async ({
  page,
}) => {
  await registerFreshUser(page, '/communication')
  await page.getByRole('heading', { name: 'No communication yet' }).waitFor()
  await page.keyboard.press('n')
  await page.keyboard.press('x')
  const form = pane(page)
  await form.getByRole('textbox', { name: 'Subject' }).fill('Half written')
  await form.getByRole('button', { name: /^Log message/ }).click()
  await expect(form.getByRole('alert').filter({ hasText: 'Say who it was to' })).toBeVisible()
  await form.getByRole('button', { name: 'Cancel' }).click()
  await expect(form.getByRole('alert').filter({ hasText: 'unsaved changes' })).toBeVisible()
  await form.getByRole('button', { name: 'Discard changes' }).click()
  await expect(form).toHaveCount(0)
})

test('the + on a person’s timeline logs a message with them (FR-061)', async ({ page }) => {
  const { sarah } = await harbour(page)
  await page.goto(`/people/${sarah.id as string}`)
  await page
    .getByRole('region', { name: 'Timeline' })
    .getByRole('button', { name: 'Log a message' })
    .click()
  const form = pane(page)
  // With her, and with where she works now.
  await expect(form.getByRole('button', { name: 'Remove Sarah Whitfield' })).toBeVisible()
  await expect(form.getByRole('button', { name: 'Remove Harbour & Lane LLP' })).toBeVisible()
  await form.getByRole('textbox', { name: 'Subject' }).fill('Coffee next week?')
  await form.getByRole('button', { name: /^Log message/ }).click()
  await expect(form).toHaveCount(0)
  await expect(
    page.getByRole('region', { name: 'Timeline' }).locator('[data-timeline-entry="message"]'),
  ).toContainText('Coffee next week?')
})
