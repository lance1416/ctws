import { expect, test, type Page } from '@playwright/test'
import { logOut, registerFreshUser } from './helpers'

/**
 * The front page: who is not signed in sees what CTWS is at `/`, and the way in. Every other
 * address still asks them to sign in, and whoever is signed in never sees it.
 */

/** This stack takes new accounts; a server that does not is answered for here. */
const closeSignUps = (page: Page) =>
  page.route('**/api/v1/auth/registration', (route) => route.fulfill({ json: { open: false } }))

test('a visitor at / sees the front page, and Sign in goes to the sign-in page', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'One place for your work, your life and the things you think of.',
  )
  await page.getByRole('main').getByRole('link', { name: 'Sign in' }).first().click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByLabel('Email')).toBeVisible()
})

test('a shared link to it previews with its name, a line and the picture', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('CTWS: Cheesy Toast Work Space')
  const meta = (key: string) =>
    page.locator(`meta[name="${key}"], meta[property="${key}"]`).getAttribute('content')
  const line =
    "One person's hub. Your work, your life and the things you think of all go in here, and once they are in they know about each other."
  expect(await meta('description')).toBe(line)
  expect(await meta('og:description')).toBe(line)
  expect(await meta('og:title')).toBe('CTWS: Cheesy Toast Work Space')
  expect(await meta('og:type')).toBe('website')
  expect(await page.locator('html').getAttribute('lang')).toBe('en')
  // The picture is named in full where the deploy says its address, and left out where not.
  const image = page.locator('meta[property="og:image"]')
  if ((await image.count()) > 0)
    expect(await image.getAttribute('content')).toMatch(/^https?:\/\/[^%]+\/og\.png$/)
  expect((await page.request.get('/og.png')).headers()['content-type']).toBe('image/png')
})

test('whoever is signed in gets the workbench at /, not the front page', async ({ page }) => {
  await registerFreshUser(page, '/')
  await page.goto('/')
  await expect(page.getByTestId('current-user')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: /One place for/ })).toHaveCount(0)
})

test('signing out at / lands on the sign-in page, not the front page', async ({ page }) => {
  await registerFreshUser(page, '/')
  await logOut(page)
  await expect(page).toHaveURL(/\/login$/)
})

test('with sign-ups closed, Create an account is greyed and says why, here and on sign-in', async ({
  page,
}) => {
  await closeSignUps(page)
  let registered = false
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/v1/auth/register') registered = true
  })

  await page.goto('/')
  const offer = page.getByRole('main').getByRole('button', { name: 'Create an account' }).first()
  await expect(offer).toHaveAttribute('aria-disabled', 'true')
  await expect(offer).toHaveAccessibleDescription(/Sign-ups are closed on this server/)
  // Forced: a greyed button still takes the press, and the press must do nothing.
  await offer.click({ force: true })
  await expect(page).toHaveURL(/\/$/)

  await page.goto('/login')
  await page.getByLabel('Email').fill('nobody-yet@example.com')
  await page.getByLabel('Password').fill('correct horse battery')
  const create = page.getByRole('button', { name: 'Create an account' })
  await expect(create).toHaveAttribute('aria-disabled', 'true')
  await expect(create).toHaveAccessibleDescription(/Sign-ups are closed on this server/)
  await create.click({ force: true })
  await expect(page.getByTestId('current-user')).toHaveCount(0)
  expect(registered).toBe(false)
  // The way it points to instead is the guide to running a copy of one's own.
  await expect(page.getByRole('link', { name: 'run your own' })).toHaveAttribute(
    'href',
    /DEPLOY\.md$/,
  )
})

test('with sign-ups open, Create an account goes to the sign-in page to make one', async ({
  page,
}) => {
  await page.goto('/')
  const offer = page.getByRole('main').getByRole('link', { name: 'Create an account' }).first()
  await offer.click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText('Sign-ups are closed', { exact: false })).toHaveCount(0)
})

test('the pictures follow the theme switch', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  const hero = page.getByRole('img', { name: /The workbench/ })
  await expect(hero).toHaveAttribute('src', /workbench-light\.webp$/)
  await page.getByRole('button', { name: 'Switch to dark' }).click()
  await expect(hero).toHaveAttribute('src', /workbench-dark\.webp$/)
})

test('every picture the page asks for is there', async ({ page }) => {
  const missing: string[] = []
  page.on('response', (r) => {
    if (new URL(r.url()).pathname.startsWith('/landing/') && !r.ok()) missing.push(r.url())
  })
  await page.goto('/')
  // Lazy pictures load as they come near: walk the page down to the footer.
  for (const section of await page.locator('main > section').all()) {
    await section.scrollIntoViewIfNeeded()
  }
  await page.waitForLoadState('networkidle')
  expect(missing).toEqual([])
})

test('on a phone the page is one column that never scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBe(0)
  // The phone's own screen, not the desk's shrunk.
  await expect
    .poll(() =>
      page
        .getByRole('img', { name: /The workbench/ })
        .evaluate((i: HTMLImageElement) => i.currentSrc),
    )
    .toMatch(/phone-workbench-light\.webp$/)
})
