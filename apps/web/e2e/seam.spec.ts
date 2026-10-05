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
  await expect(page.getByRole('heading', { level: 1, name: '今天' })).toBeVisible()

  await page.goto('/tasks/completed')
  await expect(page).toHaveURL(/\/tasks\/completed$/)
  await expect(page.getByRole('heading', { level: 1, name: '已完成' })).toBeVisible()
})

test('the rail is built from the registered destinations', async ({ page }) => {
  await registerFreshUser(page)
  const rail = page.getByRole('navigation', { name: '主导航' })

  // Each rail row carries the path the MODULE registered, not one the shell wrote down: moving a
  // destination in the registry has to move the link, which is the whole point of the seam.
  await expect(rail.getByRole('link', { name: '今天' })).toHaveAttribute('href', '/tasks/today')
  await expect(rail.getByRole('link', { name: '已完成' })).toHaveAttribute(
    'href',
    '/tasks/completed',
  )
  // The shell's own surface, outside any module namespace.
  await expect(rail.getByRole('link', { name: '项目', exact: true })).toHaveAttribute(
    'href',
    '/projects',
  )

  await rail.getByRole('link', { name: '今天' }).click()
  await expect(page).toHaveURL(/\/tasks\/today$/)
})

test('the paths from before the move still land on the same page', async ({ page }) => {
  await registerFreshUser(page)

  // A bookmark, or a tab that was open when the container restarted.
  await page.goto('/completed')
  await expect(page).toHaveURL(/\/tasks\/completed$/)
  await expect(page.getByRole('heading', { level: 1, name: '已完成' })).toBeVisible()

  // The workspace root is not a page of its own: it opens the module you work in.
  await page.goto('/')
  await expect(page).toHaveURL(/\/tasks\/today$/)
  await expect(page.getByRole('heading', { level: 1, name: '今天' })).toBeVisible()
})

test('a path no module registered still resolves', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/notes/recent')
  await expect(page).toHaveURL(/\/tasks\/today$/)
  await expect(page.getByRole('heading', { level: 1, name: '今天' })).toBeVisible()
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
