import { expect, test, type Page } from '@playwright/test'
import { registerFreshUser } from './helpers'

/**
 * The workbench is where the app opens. What its widgets hold, and how they are arranged, is in
 * `workbench.pinned.spec.ts`: it depends on the day.
 */

const card = (page: Page, name: string) => page.getByRole('region', { name, exact: true })

test('signing in lands on the workbench, not inside a module', async ({ page }) => {
  await registerFreshUser(page, '/')
  await expect(page).toHaveURL(/\/$/)
  // The modules' widgets and the shell's own; what each holds is workbench.pinned's.
  for (const name of ['Now', 'Launcher', 'Next meetings', 'Awaiting reply', 'Next seven days'])
    await expect(card(page, name)).toBeVisible()
})
