import { expect, test } from '@playwright/test'
import { registerFreshUser } from './helpers'

/**
 * The module seam, through the real app: the rail is built from the pages each module pinned, and
 * a path nobody registered still lands somewhere.
 */
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
  // A pinned row carries the path its MODULE registered, not one the shell wrote down: moving a
  // page in the registry has to move the link. The shell's own surfaces are outside any namespace.
  await expect(rail.getByRole('link', { name: 'Today' })).toHaveAttribute('href', '/tasks/today')
  await expect(rail.getByRole('link', { name: 'Things' })).toHaveAttribute('href', '/things')
  await expect(rail.getByRole('link', { name: 'Projects', exact: true })).toHaveAttribute(
    'href',
    '/projects',
  )

  await rail.getByRole('link', { name: 'Today' }).click()
  await expect(page).toHaveURL(/\/tasks\/today$/)
})

test('a path no module registered lands on the workbench', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/notes/recent')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Workbench' })).toBeVisible()
})
