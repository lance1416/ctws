import { expect, test, type Page } from '@playwright/test'
import { registerFreshUser, WEB } from './helpers'

/**
 * THINGS: EVERY KIND OF THING IN ONE PLACE.
 *
 * The rail has no row per kind. Kinds sit behind this one page, so a new kind adds a row here and
 * nothing to the chrome. The page has to stay complete for that to hold: a kind with nothing in it
 * is still listed, because hiding it is how a person stops knowing it exists.
 */

const kind = (page: Page, label: string) => page.locator(`[data-kind="${label}"]`)

test('lists every kind of thing in order, each linking to its own page', async ({ page }) => {
  await registerFreshUser(page, '/things')
  await expect(page.getByRole('heading', { level: 1, name: 'Things' })).toBeVisible()
  const labels = await page
    .locator('[data-kind]')
    .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-kind')))
  expect(labels).toEqual(['Projects', 'Tasks', 'People', 'Meetings', 'Reading'])

  for (const [label, href] of [
    ['Projects', '/projects'],
    ['Tasks', '/tasks/today'],
    ['People', '/people'],
    ['Meetings', '/meetings'],
    ['Reading', '/reading'],
  ] as const) {
    await expect(kind(page, label).getByRole('link', { name: label })).toHaveAttribute('href', href)
  }
  // The key that goes there is shown beside it, not taught in a sentence.
  await expect(kind(page, 'People').locator('kbd')).toHaveText('g n')
  await expect(kind(page, 'Reading').locator('kbd')).toHaveText('g l')
})

test('a kind with nothing in it is still listed', async ({ page }) => {
  await registerFreshUser(page, '/things')
  await expect(kind(page, 'Reading')).toBeVisible()
  await expect(kind(page, 'Reading').locator('[data-count]')).toHaveText('0 to read')
  await expect(kind(page, 'Reading').locator('[data-status]')).toHaveCount(0)
})

test('each kind says how many, and what is current', async ({ page }) => {
  await registerFreshUser(page, '/things')
  const res = await page.request.post('/api/v1/reading', {
    headers: WEB,
    data: { kind: 'book', title: 'The Elements of Typographic Style' },
  })
  expect(res.status(), await res.text()).toBe(201)
  await page.reload()
  await expect(kind(page, 'Reading').locator('[data-count]')).toHaveText('1 to read')
  await expect(kind(page, 'Reading').locator('[data-status]')).toHaveText('1 not in a project')
})

test('the rail entry for Things goes there', async ({ page }) => {
  await registerFreshUser(page, '/')
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Things' })
    .click()
  await expect(page).toHaveURL(/\/things$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Things' })).toBeVisible()
})

test('People says whose birthday is next, as a countdown', async ({ page }) => {
  await registerFreshUser(page, '/things')
  const soon = new Date()
  soon.setDate(soon.getDate() + 3)
  const res = await page.request.post('/api/v1/people', {
    headers: WEB,
    data: {
      name: '妈妈',
      birthday: { calendar: 'solar', month: soon.getMonth() + 1, day: soon.getDate() },
    },
  })
  expect(res.status(), await res.text()).toBe(201)
  await page.reload()
  await expect(kind(page, 'People').locator('[data-status]')).toHaveText(
    'Next birthday: 妈妈 in 3 days',
  )
})
