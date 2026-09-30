import { expect, test } from '@playwright/test'

// Requires the API running with AUTH_REGISTRATION=open and CORS_ORIGINS including
// http://localhost:5173. Register is rate limited (20/min/IP), so each run uses a unique email.
test('register, stay signed in across a reload, then log out', async ({ page, context }) => {
  const email = `e2e-${Date.now()}@example.com`

  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('correct horse battery')
  await page.getByRole('button', { name: 'Register' }).click()

  await expect(page.getByTestId('current-user')).toHaveText(email)
  await expect(page.getByTestId('workspace-id')).not.toBeEmpty()

  // Proof that cookie authentication works: still signed in after a reload.
  await page.reload()
  await expect(page.getByTestId('current-user')).toHaveText(email)

  // The session cookie must really be in the browser jar (otherwise the next assertion
  // would pass vacuously), and the jar must mark it HttpOnly.
  const session = (await context.cookies()).find((c) => c.name === 'ctws_session')
  expect(session).toBeDefined()
  expect(session!.httpOnly).toBe(true)

  // ...yet page JavaScript cannot read it (spec section 10.2).
  expect(await page.evaluate(() => document.cookie)).not.toContain('ctws_session')

  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByLabel('Email')).toBeVisible()

  await page.reload()
  await expect(page.getByLabel('Email')).toBeVisible()
})
