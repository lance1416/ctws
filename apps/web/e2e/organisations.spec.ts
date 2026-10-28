import { expect, test, type Page } from '@playwright/test'
import { apiPost, makeProject, makeTask, registerFreshUser } from './helpers'

/**
 * ORGANISATIONS (FR-064, FR-065): the overview answers who you are in touch with and where each
 * stands; an organisation's page says what it is, who is there and which projects it is in; one is
 * written down on a page of its own.
 */
const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Organisations' })

async function put(page: Page, path: string, data: object) {
  const res = await page.request.put(`/api/v1${path}`, {
    headers: { 'x-ctws-client': 'web' },
    data,
  })
  expect(res.ok(), `${path}: ${res.status()}`).toBe(true)
  return res.json()
}

/** Harbour & Lane, a law firm in London, with two people now, shortlisted in Find a lawyer. */
async function harbour(page: Page) {
  await registerFreshUser(page, '/organisations')
  const firm = await apiPost(page, '/organisations', {
    name: 'Harbour & Lane LLP',
    type: 'Law firm',
    city: 'London',
    website: 'https://harbour-lane.example',
  })
  await apiPost(page, '/organisations', { name: 'Morrow Legal', type: 'Law firm' })
  await apiPost(page, '/organisations', { name: 'Stripe', type: 'Company' })
  await apiPost(page, '/organisations', { name: 'Somewhere' })
  const sarah = await apiPost(page, '/people', { givenName: 'Sarah', familyName: 'Whitfield' })
  const james = await apiPost(page, '/people', { givenName: 'James', familyName: 'Okoro' })
  await put(page, `/people/${sarah.id}/roles`, {
    roles: [{ organisationId: firm.id, title: 'Partner' }],
  })
  await put(page, `/people/${james.id}/roles`, {
    roles: [{ organisationId: firm.id, title: 'Associate' }],
  })
  const lawyer = await makeProject(page, 'Find a lawyer')
  const stages = await put(page, `/projects/${lawyer}/stages`, {
    stages: [{ name: 'Contacted' }, { name: 'Shortlisted' }],
  })
  const shortlisted = (stages.stages as { id: string; name: string }[]).find(
    (s) => s.name === 'Shortlisted',
  )!
  const node = await makeTask(page, lawyer, 'Harbour & Lane', { stageId: shortlisted.id })
  await apiPost(page, '/relations', {
    from: { type: 'task', id: node },
    to: { type: 'organisation', id: firm.id },
  })
  await apiPost(page, '/communication', {
    direction: 'sent',
    channel: 'email',
    parties: [{ type: 'person', id: sarah.id }],
    subject: 'Enquiry: review of our employment contracts',
  })
  return { firm, sarah, lawyer }
}

test('the overview counts each type, and a type narrows the table and the list', async ({
  page,
}) => {
  await harbour(page)
  await page.goto('/organisations')
  const types = page.getByRole('main').getByRole('group', { name: 'Type' })
  await expect(types.getByRole('link', { name: 'All 4' })).toBeVisible()
  await expect(types.getByRole('link', { name: 'Law firms 2' })).toBeVisible()
  await expect(types.getByRole('link', { name: 'Companies 1' })).toBeVisible()
  await expect(types.getByRole('link', { name: 'Other 1' })).toBeVisible()

  // Sarah works there now: the message to her is an exchange with the firm (FR-071).
  const inTouch = page.getByRole('region', { name: 'In touch, last 30 days' })
  const row = inTouch.locator('[data-in-touch]').filter({ hasText: 'Harbour & Lane LLP' })
  await expect(row).toContainText('Find a lawyer')
  await expect(row).toContainText('Shortlisted')
  await expect(row).toContainText('Today')
  await expect(row).toContainText('1 person')

  await types.getByRole('link', { name: 'Companies 1' }).click()
  await expect(page).toHaveURL(/\/organisations\?type=Company$/)
  await expect(inTouch).toContainText('None')
  await expect(sidebar(page).getByRole('link', { name: 'Stripe' })).toBeVisible()
  await expect(sidebar(page).getByRole('link', { name: 'Morrow Legal' })).toHaveCount(0)

  await types.getByRole('link', { name: 'Law firms 2' }).click()
  await expect(row).toBeVisible()
  await expect(sidebar(page).getByRole('link', { name: 'Morrow Legal' })).toBeVisible()
  await expect(sidebar(page).getByRole('link', { name: 'Stripe' })).toHaveCount(0)
})

test('an organisation’s page says what it is, who is there and where it stands', async ({
  page,
}) => {
  const { firm, lawyer } = await harbour(page)
  await sidebar(page).getByRole('link', { name: 'Harbour & Lane LLP' }).click()
  await expect(page).toHaveURL(new RegExp(`/organisations/${firm.id as string}$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Harbour & Lane LLP' })).toBeVisible()
  const main = page.getByRole('main')
  await expect(main).toContainText('Law firm')

  const about = page.getByRole('region', { name: 'About' })
  await expect(about.getByRole('link', { name: 'harbour-lane.example' })).toHaveAttribute(
    'href',
    'https://harbour-lane.example/',
  )
  await expect(about).toContainText('London')

  const people = page.getByRole('region', { name: 'People' })
  await expect(people).toContainText('2 now')
  await expect(people.getByRole('link', { name: /Sarah Whitfield\s*Partner/ })).toBeVisible()
  await expect(people.getByRole('link', { name: /James Okoro\s*Associate/ })).toBeVisible()

  const projects = page.getByRole('region', { name: 'In projects' })
  await expect(projects.getByRole('link', { name: 'Find a lawyer' })).toHaveAttribute(
    'href',
    `/projects/${lawyer}`,
  )
  await expect(projects).toContainText('Shortlisted')

  // What was said with Sarah while she works there, and where its node moved (FR-065).
  const timeline = page.getByRole('region', { name: 'Timeline' })
  const message = timeline.locator('[data-timeline-entry="message"]')
  await expect(message).toContainText('Enquiry: review of our employment contracts')
  await expect(message).toContainText('To Sarah Whitfield')
  await expect(timeline).toContainText(
    /Stage set to\s*(Stage )?Shortlisted in\s*\S*\s*Find a lawyer/,
  )
  await expect(timeline).toContainText('Added')
  await timeline.getByRole('tab', { name: 'Changes' }).click()
  await expect(message).toHaveCount(0)
  await expect(timeline).toContainText(
    /Stage set to\s*(Stage )?Shortlisted in\s*\S*\s*Find a lawyer/,
  )
  await timeline.getByRole('tab', { name: 'Messages' }).click()
  await expect(message).toHaveCount(1)
  await expect(timeline).not.toContainText('Added')

  // The filters are tabs over the entries (BUG-061): one Tab stop, the arrows switching.
  const tabs = timeline.getByRole('tablist', { name: 'Show' }).getByRole('tab')
  await expect(tabs.and(page.locator('[tabindex="0"]'))).toHaveCount(1)
  const shown = await tabs.first().getAttribute('aria-controls')
  await expect(page.locator(`[id="${shown!}"]`)).toContainText('Enquiry')
  await timeline.getByRole('tab', { name: 'Messages' }).focus()
  await page.keyboard.press('ArrowLeft')
  await expect(timeline.getByRole('tab', { name: 'All' })).toBeFocused()
  await expect(timeline.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true')
  await expect(timeline).toContainText('Added')
})

test('N O writes one down on a page of its own, and Edit changes it', async ({ page }) => {
  await registerFreshUser(page, '/organisations')
  await apiPost(page, '/organisations', { name: 'Morrow Legal', type: 'Law firm' })
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Organisations' })).toBeVisible()
  await page.keyboard.press('n')
  await page.keyboard.press('o')
  await expect(page).toHaveURL(/\/organisations\/new$/)
  const name = page.getByRole('textbox', { name: 'Name', exact: true })
  await expect(name).toBeFocused()

  // Only the name is needed, and saying nothing says so.
  await page.getByRole('button', { name: /^Create organisation/ }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'needs a name' })).toBeVisible()

  await name.fill('Clifford Rowe LLP')
  // A type used before is one press.
  await page
    .getByRole('group', { name: 'Types used so far' })
    .getByRole('button', { name: 'Law firm' })
    .click()
  await page.getByRole('textbox', { name: 'Website' }).fill('clifford-rowe.example')
  await page.getByRole('textbox', { name: 'Notes' }).press('Control+Enter')
  await expect(page.getByRole('heading', { level: 1, name: 'Clifford Rowe LLP' })).toBeVisible()
  await expect(page.getByRole('main')).toContainText('Law firm')
  await expect(
    page
      .getByRole('region', { name: 'About' })
      .getByRole('link', { name: 'clifford-rowe.example' }),
  ).toHaveAttribute('href', 'https://clifford-rowe.example/')

  await page.getByRole('link', { name: 'Edit' }).click()
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Clifford Rowe')
  await page.getByRole('button', { name: /^Save/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Clifford Rowe' })).toBeVisible()
  await expect(sidebar(page).getByRole('link', { name: 'Clifford Rowe' })).toBeVisible()
})

test('deleting one says who loses a role there, and the people stay', async ({ page }) => {
  const { firm } = await harbour(page)
  await page.goto(`/organisations/${firm.id as string}/edit`)
  await page.getByRole('button', { name: 'Delete Harbour & Lane LLP' }).click()
  await expect(page.getByText('2 people lose a role there')).toBeVisible()
  await page.getByRole('button', { name: 'Delete Harbour & Lane LLP' }).last().click()
  await expect(page).toHaveURL(/\/organisations$/)
  await expect(sidebar(page).getByRole('link', { name: 'Harbour & Lane LLP' })).toHaveCount(0)
  await page.goto('/people')
  await expect(
    page.getByRole('navigation', { name: 'People' }).getByRole('link', { name: 'Sarah Whitfield' }),
  ).toBeVisible()
})
