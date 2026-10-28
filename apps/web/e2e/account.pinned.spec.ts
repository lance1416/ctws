import { expect, test } from '@playwright/test'
import { registerFreshUser, WEB } from './helpers'

/**
 * THE ACCOUNT (artboard 30), on the server pinned at Thursday, October 22, 2026, 00:30 UTC: the
 * zone every day is counted in, changed in place; light, dark or the system's, one setting with
 * the top bar's switch; the password, changed under its row; and Sign out.
 */
test.use({ timezoneId: 'Europe/London', viewport: { width: 1440, height: 900 } })

const PASSWORD = 'correct horse battery'

test('it is reached from the account menu, and says who is signed in', async ({ page }) => {
  const email = await registerFreshUser(page, '/')
  await page.getByTestId('current-user').click()
  await page.getByRole('menuitem', { name: 'Account and time zone' }).click()
  await expect(page).toHaveURL(/\/account$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Account')
  await expect(page.getByRole('main')).toContainText(email)
})

test('the zone changes in place, saved on picking, and the clock follows', async ({ page }) => {
  await registerFreshUser(page, '/account')
  const place = page.getByRole('region', { name: 'Time and place' })
  await expect(place).toContainText('Europe/London')
  // 00:30 UTC is 01:30 in London, 08:30 in Shanghai.
  await expect(place).toContainText(/01:3\d now/)

  await place.getByRole('button', { name: 'Change' }).click()
  await place.getByRole('combobox', { name: 'Time zone' }).press('Escape')
  await expect(place).toContainText('Europe/London')

  await place.getByRole('button', { name: 'Change' }).click()
  await place.getByRole('combobox', { name: 'Time zone' }).fill('shanghai')
  await place.getByRole('option', { name: 'Asia/Shanghai' }).click()
  await expect(place).toContainText('Asia/Shanghai')
  await expect(place).toContainText(/08:3\d now/)
  const me = await page.request.get('/api/v1/auth/me', { headers: WEB })
  expect(((await me.json()) as { timezone: string }).timezone).toBe('Asia/Shanghai')
})

test('the theme here and the top bar switch are one setting', async ({ page }) => {
  await registerFreshUser(page, '/account')
  const theme = page.getByRole('radiogroup', { name: 'Theme' })
  await expect(theme.getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: /^Switch to / }).click()
  await expect(theme.getByRole('radio', { name: 'System' })).toHaveAttribute(
    'aria-checked',
    'false',
  )
  await theme.getByRole('radio', { name: 'Dark' }).click()
  await expect(page.getByRole('button', { name: 'Switch to light' })).toBeVisible()
  // One Tab stop; the arrows pick as they move (DES-001 section 4).
  await expect(theme.getByRole('radio', { name: 'Light' })).toHaveAttribute('tabindex', '-1')
  await theme.getByRole('radio', { name: 'Dark' }).press('ArrowRight')
  await expect(theme.getByRole('radio', { name: 'System' })).toBeFocused()
  await expect(theme.getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true')
})

test('the password changes under its row, saying why it cannot first', async ({ page }) => {
  await registerFreshUser(page, '/account')
  const signing = page.getByRole('region', { name: 'Signing in' })
  await expect(signing).toContainText('Set')
  await signing.getByRole('button', { name: 'Change password' }).click()
  const form = page.getByRole('form', { name: 'Change password' })

  await form.getByLabel('New password', { exact: true }).fill('short')
  await form.getByLabel('Repeat the new password').focus()
  await expect(form).toContainText('At least 12 characters.')
  await form.getByLabel('New password', { exact: true }).fill('a much longer passphrase')
  await form.getByLabel('Repeat the new password').fill('a much longer passphrasf')
  await form.getByLabel('Current password', { exact: true }).focus()
  await expect(form).toContainText('This is not the same as the new password.')
  await form.getByLabel('Repeat the new password').fill('a much longer passphrase')

  await form.getByLabel('Current password', { exact: true }).fill('not my password')
  await form.getByRole('button', { name: /^Change password/ }).click()
  await expect(form).toContainText('That is not your current password.')

  await form.getByLabel('Current password', { exact: true }).fill(PASSWORD)
  await form.getByLabel('Current password', { exact: true }).press('ControlOrMeta+Enter')
  await expect(form).toHaveCount(0)
  await expect(signing).toContainText('Changed Oct 22')
})

test('Sign out asks nothing', async ({ page }) => {
  await registerFreshUser(page, '/account')
  await page.getByRole('main').getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login/)
})
