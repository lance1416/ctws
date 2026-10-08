import { expect, test } from '@playwright/test'
import { registerFreshUser } from './helpers'

/**
 * The module seam, through the real app: the task module's pages live under its own namespace, the
 * paths they used to live at still work, and a path nobody registered still lands somewhere.
 *
 * None of this could pass against the pre-seam app, where `/tasks/today` was a 404 page and `/`
 * was the today page rather than a redirect to it.
 */
test('the module pages answer under the module namespace', async ({ page }) => {
  await registerFreshUser(page)

  await page.goto('/tasks/today')
  await expect(page).toHaveURL(/\/tasks\/today$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()

  await page.goto('/tasks/completed')
  await expect(page).toHaveURL(/\/tasks\/completed$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Done' })).toBeVisible()
})

test('the rail is built from the registered destinations', async ({ page }) => {
  await registerFreshUser(page)
  const rail = page.getByRole('navigation', { name: 'Main navigation' })

  // Each rail row carries the path the MODULE registered, not one the shell wrote down: moving a
  // destination in the registry has to move the link, which is the whole point of the seam.
  await expect(rail.getByRole('link', { name: 'Today' })).toHaveAttribute('href', '/tasks/today')
  await expect(rail.getByRole('link', { name: 'Reading' })).toHaveAttribute('href', '/reading')
  // The shell's own surface, outside any module namespace.
  await expect(rail.getByRole('link', { name: 'Projects', exact: true })).toHaveAttribute(
    'href',
    '/projects',
  )

  await rail.getByRole('link', { name: 'Today' }).click()
  await expect(page).toHaveURL(/\/tasks\/today$/)
})

test('the rail is grouped by what you are doing, in a fixed reading order', async ({ page }) => {
  // The rail used to be a flat list in the order the modules happened to be registered, which is
  // how the calendar ended up above Today. The order is an editorial decision now and declared.
  await registerFreshUser(page, '/')
  const rail = page.getByRole('navigation', { name: 'Main navigation' })

  await expect(rail.getByRole('link')).toHaveText([
    'Workbench',
    'Today',
    'Meetings',
    'Contacts',
    'Reading',
    'Calendar',
    'Review',
    'Projects',
    'Inbox',
  ])
  // Three groups: what is in front of me now | the kinds of thing I keep | the ways of looking
  // across them. Two hairlines divide them; Projects is divided off by its own label instead,
  // because what is under it is the person's own and it grows.
  await expect(rail.locator('span[aria-hidden="true"].h-px')).toHaveCount(2)
  // The first group needs no name; the other two carry one, because "Meetings, Contacts,
  // Reading" and "Calendar, Review" are not self-evidently two different kinds of row.
  await expect(rail.getByText('Things', { exact: true })).toBeVisible()
  await expect(rail.getByText('Views', { exact: true })).toBeVisible()
})

test('the paths from before the move still land on the same page', async ({ page }) => {
  await registerFreshUser(page)

  // A bookmark, or a tab that was open when the container restarted.
  await page.goto('/completed')
  await expect(page).toHaveURL(/\/tasks\/completed$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Done' })).toBeVisible()

  // The workspace root IS a page of its own now -- the workbench. It used to redirect into a
  // module because the shell had nothing to show; with two modules it has their glances.
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

test('the API answers the module namespace and redirects the old path to it', async ({ page }) => {
  await registerFreshUser(page)

  const now = await page.request.get('/api/v1/tasks/today')
  expect(now.status()).toBe(200)

  // Followed by the client, so the old path is still usable and not merely present.
  const then = await page.request.get('/api/v1/today')
  expect(then.status()).toBe(200)
  expect(new URL(then.url()).pathname).toBe('/api/v1/tasks/today')

  const unredirected = await page.request.get('/api/v1/today', { maxRedirects: 0 })
  expect(unredirected.status()).toBe(308)
  expect(unredirected.headers()['location']).toBe('/api/v1/tasks/today')
})
