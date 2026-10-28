import { expect, test } from '@playwright/test'
import { holdFirstRead, logOut, makeProject, registerFreshUser } from './helpers'

/**
 * The sign-in screen: Enter signs in from either field.
 *
 * The fields live inside a <form>, and a form that submits is a page NAVIGATION unless it is
 * prevented: a login screen that reloads loses the typing and the error message with it, which
 * looks like nothing in a screenshot.
 */

test('Enter from either field signs in, without reloading the page', async ({ page }) => {
  const email = await registerFreshUser(page)
  await logOut(page)
  await expect(page.getByLabel('Email')).toBeVisible()

  // A marker on the window: if the form submitted natively, the document is replaced and it goes.
  await page.evaluate(() => ((window as unknown as { __kept?: boolean }).__kept = true))

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('correct horse battery')
  await page.getByLabel('Password').press('Enter')

  await expect(page.getByTestId('current-user')).toHaveAccessibleName(`Account: ${email}`)
  expect(await page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(true)
  // The query string is untouched: a native GET submit would have put the password in the URL.
  expect(new URL(page.url()).search).toBe('')
})

test('a rejected sign-in says so and keeps what was typed', async ({ page }) => {
  const email = await registerFreshUser(page)
  await logOut(page)
  await expect(page.getByLabel('Email')).toBeVisible()

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('the wrong one entirely')
  await page.getByLabel('Password').press('Enter')

  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('Email')).toHaveValue(email)
  await expect(page.getByLabel('Password')).toHaveValue('the wrong one entirely')
  await expect(page.getByTestId('current-user')).toHaveCount(0)
})

test('creating an account is a deliberate second press, not what Enter does', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByLabel('Email')).toBeVisible()

  // An email nobody has registered. Enter must try to LOG IN with it (and fail), not register it:
  // the quiet secondary action must not be what the primary key does.
  const email = `signin-${Date.now()}@example.com`
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('correct horse battery')
  const attempt = page.waitForResponse((r) => /\/auth\/(login|register)$/.test(r.url()))
  await page.getByLabel('Password').press('Enter')
  const res = await attempt
  expect(new URL(res.url()).pathname).toBe('/api/v1/auth/login')
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByTestId('current-user')).toHaveCount(0)

  // The same two fields, through Create an account, do make the account.
  await page.getByRole('button', { name: 'Create an account' }).click()
  await expect(page.getByTestId('current-user')).toHaveAccessibleName(`Account: ${email}`)
})

test('after a session ends, signing in again goes back to the page, and shows no one else’s', async ({
  page,
  context,
}) => {
  const other = await registerFreshUser(page)
  await logOut(page)
  await registerFreshUser(page)
  const mine = await makeProject(page, 'Only mine')
  await page.goto(`/projects/${mine}`)
  await expect(page.getByRole('navigation', { name: 'Projects' })).toContainText('Only mine')

  // The session ends behind the page's back; it finds out the next time it asks who is signed in.
  // Not while a read is out: one sent before the end still answers for the session it carried.
  await page.waitForLoadState('networkidle')
  await context.clearCookies()
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByLabel('Email')).toBeVisible()

  const release = await holdFirstRead(page, '**/api/v1/projects')
  await page.getByLabel('Email').fill(other)
  await page.getByLabel('Password').fill('correct horse battery')
  await page.getByLabel('Password').press('Enter')
  await expect(page.getByTestId('current-user')).toHaveAccessibleName(`Account: ${other}`)
  await expect(page).toHaveURL(`/projects/${mine}`)
  await expect(page.getByText('Only mine')).toHaveCount(0)
  // The held read, the old session's, lands before the test ends, and still shows nothing of it.
  const stale = page.waitForResponse('**/api/v1/projects')
  release()
  await stale
  await expect(page.getByText('Only mine')).toHaveCount(0)
})
