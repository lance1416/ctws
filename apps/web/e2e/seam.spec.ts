import { expect, test } from '@playwright/test'
import { registerFreshUser } from './helpers'

/**
 * The module seam, through the real app: the task module's pages live under its own namespace, the
 * workspace root is the shell's own page, and a path nobody registered still lands somewhere.
 */
test('the module pages answer under the module namespace', async ({ page }) => {
  await registerFreshUser(page)

  await page.goto('/tasks/today')
  await expect(page).toHaveURL(/\/tasks\/today$/)
  await expect(page.locator('#today-heading')).toBeVisible()

  await page.goto('/tasks/completed')
  await expect(page).toHaveURL(/\/tasks\/completed$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Done' })).toBeVisible()
})

test('the rail is built from the pinned pages', async ({ page }) => {
  await registerFreshUser(page)
  const rail = page.getByRole('navigation', { name: 'Main navigation' })

  // A pinned row carries the path its MODULE registered, not one the shell wrote down: moving a
  // page in the registry has to move the link, which is the whole point of the seam.
  await expect(rail.getByRole('link', { name: 'Today' })).toHaveAttribute('href', '/tasks/today')
  // Every kind sits behind one entry, and the shell's own surfaces are outside any namespace.
  await expect(rail.getByRole('link', { name: 'Things' })).toHaveAttribute('href', '/things')
  await expect(rail.getByRole('link', { name: 'Projects', exact: true })).toHaveAttribute(
    'href',
    '/projects',
  )

  await rail.getByRole('link', { name: 'Today' }).click()
  await expect(page).toHaveURL(/\/tasks\/today$/)
})

test('the rail holds the pinned pages, one Things entry and the projects', async ({ page }) => {
  // Three tiers, each with a rule for what may enter it. The pinned pages cut across every kind;
  // the kinds sit behind Things; only the project list, which is the person's own, grows.
  await registerFreshUser(page, '/')
  const rail = page.getByRole('navigation', { name: 'Main navigation' })

  await expect(rail.getByRole('link')).toHaveText([
    'Workbench',
    'Today',
    'Calendar',
    'Review',
    'Things',
    'Projects',
    'Inbox',
  ])
  // No group labels over the pinned tier: four rows that say what they are need no heading.
  await expect(rail.getByText('Views', { exact: true })).toHaveCount(0)
})

test('the workspace root is the workbench', async ({ page }) => {
  await registerFreshUser(page)

  await page.goto('/')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Workbench' })).toBeVisible()
})

test('a path no module registered still resolves', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/notes/recent')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Workbench' })).toBeVisible()
})

test('the API answers under the module namespace', async ({ page }) => {
  await registerFreshUser(page)
  const now = await page.request.get('/api/v1/tasks/today')
  expect(now.status()).toBe(200)
})
