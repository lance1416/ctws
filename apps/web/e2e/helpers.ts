import type { Page } from '@playwright/test'

// Registers a brand-new user through the UI and waits until the signed-in shell is showing.
// Register is rate limited (20/min/IP), so every call uses a unique email. Returns that email.
export async function registerFreshUser(page: Page): Promise<string> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`

  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('correct horse battery')
  await page.getByRole('button', { name: 'Register' }).click()
  await page.getByTestId('current-user').waitFor()

  return email
}
