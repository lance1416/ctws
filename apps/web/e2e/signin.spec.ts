import { expect, test } from '@playwright/test'
import { logOut, registerFreshUser } from './helpers'

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
