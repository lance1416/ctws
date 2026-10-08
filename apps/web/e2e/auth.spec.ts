import { expect, test } from '@playwright/test'
import { logOut, registerFreshUser } from './helpers'

// Runs against the API container at http://localhost:3000, which serves the built web app, so the
// page and the API are one origin. Needs AUTH_REGISTRATION=open and COOKIE_SECURE=false (plain
// http); the SameSite default (lax) and an empty CORS_ORIGINS are what a same-origin deploy uses.
// Register is rate limited (20/min/IP), so each run uses a unique email.
test('register, stay signed in across a reload, then log out', async ({ page, context }) => {
  const email = await registerFreshUser(page)

  // The account button wears the initial; the address itself is inside the menu, which is also
  // the only place it is now. The workspace id used to be printed into the DOM as a debugging
  // leftover -- it is read from the API here instead, where it actually comes from.
  await expect(page.getByTestId('current-user')).toHaveAccessibleName(`Account: ${email}`)
  const me = await page.request.get('/api/v1/auth/me')
  expect(me.ok()).toBe(true)
  expect((await me.json()).workspaceId).toBeTruthy()

  // Proof that cookie authentication works: still signed in after a reload.
  await page.reload()
  await expect(page.getByTestId('current-user')).toHaveAccessibleName(`Account: ${email}`)

  // The session cookie must really be in the browser jar (otherwise the next assertion
  // would pass vacuously), and the jar must mark it HttpOnly.
  const session = (await context.cookies()).find((c) => c.name === 'ctws_session')
  expect(session).toBeDefined()
  expect(session!.httpOnly).toBe(true)

  // ...yet page JavaScript cannot read it (spec section 10.2).
  expect(await page.evaluate(() => document.cookie)).not.toContain('ctws_session')

  await logOut(page)
  await expect(page.getByLabel('Email')).toBeVisible()

  await page.reload()
  await expect(page.getByLabel('Email')).toBeVisible()
})

// Client-side routes must deep-link: the API answers an HTML navigation to an unknown,
// non-API path with the SPA shell instead of a 404. The status check alone would pass for any
// 200, so also require the app to have rendered (the logged-out form is visible).
test('a deep client-side route returns the SPA, not a 404', async ({ page }) => {
  const response = await page.goto('/some/deep/route')
  expect(response?.status()).toBe(200)
  expect(response?.headers()['content-type']).toContain('text/html')
  await expect(page.getByLabel('Email')).toBeVisible()
})

// API routes must win over the static handler: /api/v1/health is JSON, never index.html.
test('GET /api/v1/health returns JSON, not the SPA shell', async ({ request }) => {
  const res = await request.get('/api/v1/health')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('application/json')
  expect(await res.json()).toEqual({ status: 'ok' })
})
