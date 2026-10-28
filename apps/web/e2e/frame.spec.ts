import { expect, test } from '@playwright/test'
import { registerFreshUser } from './helpers'

/** The frame of FR-017 to FR-023 (STORY-001): the regions, the icon bar, the retired addresses. */

const PLACES = [
  'Workbench',
  'Today',
  'Calendar',
  'Review',
  'Projects',
  'People',
  'Organisations',
  'Meetings',
  'Communication',
  'Reading',
  'Notes',
]

test('the icon bar holds the eleven places in order, the current one selected', async ({
  page,
}) => {
  await registerFreshUser(page)
  const bar = page.getByRole('navigation', { name: 'Modules' })
  const names = await bar
    .getByRole('link')
    .evaluateAll((links) => links.map((a) => a.getAttribute('aria-label')))
  expect(names).toEqual(PLACES)
  await expect(bar.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page')

  // A place's name and its key show on hover, as its title.
  await expect(bar.getByRole('link', { name: 'People' })).toHaveAttribute('title', /People\s+G E/)

  await bar.getByRole('link', { name: 'People' }).click()
  await expect(page).toHaveURL(/\/people$/)
  await expect(bar.getByRole('link', { name: 'People' })).toHaveAttribute('aria-current', 'page')
  // A kind's module brings its sidebar, named for it.
  await expect(page.getByRole('complementary', { name: 'People' })).toBeVisible()
})

test('the top bar is 48 high and the icon bar 52 wide', async ({ page }) => {
  await registerFreshUser(page)
  const header = await page.locator('header').boundingBox()
  expect(header?.height).toBe(48)
  const bar = await page.getByRole('navigation', { name: 'Modules' }).boundingBox()
  expect(bar?.width).toBe(52)
})

test('the old addresses go where their pages went (FR-023)', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/things')
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/tasks/today')
  await expect(page).toHaveURL(/\/today$/)
  await page.goto('/tasks/review')
  await expect(page).toHaveURL(/\/review$/)
  // Things is nowhere: not on the bar, not among search's places.
  await expect(
    page.getByRole('navigation', { name: 'Modules' }).getByRole('link', { name: 'Things' }),
  ).toHaveCount(0)
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('option', { name: /^Things/ })).toHaveCount(0)
})

test('[ hides the sidebar, and the choice survives a reload', async ({ page }) => {
  await registerFreshUser(page, '/projects')
  const sidebar = page.getByRole('complementary', { name: 'Projects' })
  await expect(sidebar).toBeVisible()
  await page.getByRole('heading', { name: 'Projects', level: 1 }).click()
  await page.keyboard.press('[')
  await expect(sidebar).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible()
  await expect(sidebar).toHaveCount(0)
  await page.keyboard.press('[')
  await expect(sidebar).toBeVisible()
})

test('the icon bar expands to names and keys, and stays expanded after a reload', async ({
  page,
}) => {
  await registerFreshUser(page)
  const bar = page.getByRole('navigation', { name: 'Modules' })
  await bar.getByRole('button', { name: 'Show names' }).click()
  await expect(bar.getByText('Organisations', { exact: true })).toBeVisible()
  await page.reload()
  await expect(bar.getByText('Organisations', { exact: true })).toBeVisible()
  await bar.getByRole('button', { name: 'Show icons only' }).click()
  await expect(bar.getByText('Organisations', { exact: true })).toHaveCount(0)
})

test('expanding the icon bar leaves the sidebar, and the longest name fits (D2-01, D2-02)', async ({
  page,
}) => {
  await registerFreshUser(page, '/projects')
  await page.setViewportSize({ width: 1440, height: 900 })
  const bar = page.getByRole('navigation', { name: 'Modules' })
  await bar.getByRole('button', { name: 'Show names' }).click()
  // Naming the icons is not hiding the sidebar: `[` is what does that.
  await expect(page.getByRole('complementary', { name: 'Projects' })).toBeVisible()
  expect((await bar.boundingBox())!.width).toBe(216)
  const longest = bar.getByText('Communication', { exact: true })
  expect(await longest.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
})

test('the N prefix swallows a key that makes nothing (BUG-018)', async ({ page }) => {
  await registerFreshUser(page)
  const before = page.url()
  // `L` alone links; after `N` it is a creator's key, and none is `L` yet.
  await page.keyboard.press('n')
  await page.keyboard.press('l')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(page.url()).toBe(before)
})

test('the inspector has its own address, survives a reload and closes on Esc', async ({ page }) => {
  await registerFreshUser(page, '/people?inspect=meeting:01a15e5c-0000-7000-8000-000000000000')
  const inspector = page.getByRole('complementary', { name: 'Inspector' })
  await expect(inspector).toBeVisible()
  // A meeting that is not there says so in the meeting's narrow page (FR-022).
  await expect(inspector).toContainText('This meeting is not here any more.')
  await expect
    .poll(() => inspector.evaluate((el) => el.contains(document.activeElement)))
    .toBe(true)
  await page.reload()
  await expect(inspector).toBeVisible()
  // The page under it stays: People is still the place.
  await expect(page.getByRole('heading', { name: 'People', level: 1 })).toBeVisible()
  await inspector.getByRole('button', { name: 'Close' }).focus()
  await page.keyboard.press('Escape')
  await expect(inspector).toHaveCount(0)
  await expect(page).toHaveURL(/\/people$/)
})

test('every place on the bar opens a page of its own, none of them a placeholder', async ({
  page,
}) => {
  await registerFreshUser(page)
  const bar = page.getByRole('navigation', { name: 'Modules' })
  for (const name of PLACES) {
    const link = bar.getByRole('link', { name, exact: true })
    const to = (await link.getAttribute('href'))!
    await link.click()
    await expect(page).toHaveURL(new URL(to, page.url()).href)
    await expect(link).toHaveAttribute('aria-current', 'page')
    // Each names itself once, even empty (FR-030); none is waiting for a later batch.
    await expect(page.getByRole('main').getByRole('heading', { level: 1 }), name).toHaveCount(1)
    await expect(page.getByText('Coming later.')).toHaveCount(0)
  }
})
