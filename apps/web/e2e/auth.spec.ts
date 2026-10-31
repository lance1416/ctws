import { expect, test } from '@playwright/test'
import { logOut, signUpThroughForm } from './helpers'

test('register, stay signed in across a reload, then log out', async ({ page, context }) => {
  const email = await signUpThroughForm(page)

  // The account button wears the initial; the address itself is inside the menu, the only place it
  // is. The workspace id is not on the page, so it is read from the API.
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

  // ...yet page JavaScript cannot read it.
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
  // What is running too: the release's tag or dev, and the commit when the build knew it.
  const body = (await res.json()) as Record<string, unknown>
  expect(Object.keys(body).sort()).toEqual(['commit', 'status', 'version'])
  expect(body).toMatchObject({
    status: 'ok',
    version: expect.stringMatching(/^(v\d+\.\d+\.\d+|dev)$/),
  })
  expect(body.commit === null || /^[0-9a-f]{8}$/.test(String(body.commit))).toBe(true)
})
