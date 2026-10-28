import { expect, test, type Page } from '@playwright/test'
import { registerFreshUser } from './helpers'

/**
 * THE WORKBENCH IS WHERE THE APP OPENS (FR-075). What its widgets hold, and how they are
 * arranged, is `workbench.pinned.spec.ts`: it depends on the day.
 */

const card = (page: Page, name: string) => page.getByRole('region', { name, exact: true })

test('signing in lands on the workbench, not inside a module', async ({ page }) => {
  await registerFreshUser(page, '/')
  await expect(page).toHaveURL(/\/$/)
  // The modules' widgets and the shell's own (FR-076); what each holds is workbench.pinned's.
  for (const name of ['Now', 'Launcher', 'Next meetings', 'Awaiting reply', 'Next seven days'])
    await expect(card(page, name)).toBeVisible()
})
