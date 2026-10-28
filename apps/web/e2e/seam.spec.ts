import { expect, test } from '@playwright/test'
import { registerFreshUser } from './helpers'

/**
 * The module seam, through the real app: a place a module defines (Today) is reached at the path
 * the module registered, and a path nobody registered still lands somewhere.
 */
test('the icon bar leads to the paths the modules registered', async ({ page }) => {
  await registerFreshUser(page, '/')
  const bar = page.getByRole('navigation', { name: 'Modules' })
  await expect(bar.getByRole('link', { name: 'Today' })).toHaveAttribute('href', '/today')
  await expect(bar.getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/review')
  await expect(bar.getByRole('link', { name: 'People' })).toHaveAttribute('href', '/people')
  await expect(bar.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/projects')
  await bar.getByRole('link', { name: 'Today' }).click()
  await expect(page).toHaveURL(/\/today$/)
})

test('a path no module registered lands on the workbench', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/nowhere/recent')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('region', { name: 'Now', exact: true })).toBeVisible()
})
