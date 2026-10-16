import { expect, test, type Page } from '@playwright/test'
import { TZDate } from '@date-fns/tz'
import { accountZone, dayInZone, meetingToday, registerFreshUser, WEB, apiPost } from './helpers'

/**
 * THINGS: EVERY KIND OF THING IN ONE PLACE.
 *
 * The rail has no row per kind. Kinds sit behind this one page, so a new kind adds a row here and
 * nothing to the chrome. The page has to stay complete for that to hold: a kind with nothing in it
 * is still listed, because hiding it is how a person stops knowing it exists.
 */

const kind = (page: Page, label: string) => page.locator(`[data-kind="${label}"]`)

test('lists every kind of thing in order, each linking to its own page', async ({ page }) => {
  await registerFreshUser(page, '/things')
  await expect(page.getByRole('heading', { level: 1, name: 'Things' })).toBeVisible()
  const labels = await page
    .locator('[data-kind]')
    .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-kind')))
  expect(labels).toEqual(['Projects', 'Tasks', 'People', 'Meetings', 'Reading'])

  for (const [label, href] of [
    ['Projects', '/projects'],
    ['Tasks', '/tasks/today'],
    ['People', '/people'],
    ['Meetings', '/meetings'],
    ['Reading', '/reading'],
  ] as const) {
    await expect(kind(page, label).getByRole('link', { name: label })).toHaveAttribute('href', href)
  }
  // The key that goes there is shown beside it, not taught in a sentence.
  await expect(kind(page, 'People').locator('kbd')).toHaveText('g n')
  await expect(kind(page, 'Reading').locator('kbd')).toHaveText('g l')
})

/**
 * A KIND'S ROW IS THE APP'S ROW: its key in the margin, a thread, then its name, its count and its
 * line. The threads are one x, and the page's heading hangs on it.
 */
test('each kind hangs on the margin: its key, a thread, then its name and its line', async ({
  page,
}) => {
  await registerFreshUser(page, '/things')
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.locator('[data-kind]')).toHaveCount(5)
  const rows = await page.locator('[data-kind]').evaluateAll((els) =>
    els.map((el) => {
      const key = el.querySelector('kbd')?.getBoundingClientRect()
      const thread = el.querySelector('[data-thread]')!.getBoundingClientRect()
      const body = el.querySelector('a')!.getBoundingClientRect()
      return {
        key: key ? Math.round(key.right) : null,
        thread: Math.round(thread.x),
        threadHeight: Math.round(thread.height),
        height: Math.round(el.getBoundingClientRect().height),
        body: Math.round(body.x),
      }
    }),
  )
  expect(new Set(rows.map((r) => r.thread)).size, 'one x for every thread').toBe(1)
  const h1 = (await page.getByRole('heading', { level: 1, name: 'Things' }).boundingBox())!
  expect(Math.round(h1.x)).toBe(rows[0]!.thread)
  for (const r of rows) {
    // The key is in the margin, before the thread; the body after it.
    if (r.key !== null) expect(r.key).toBeLessThanOrEqual(r.thread)
    expect(r.body).toBeGreaterThan(r.thread)
    // The thread runs the row's height.
    expect(r.threadHeight).toBe(r.height)
  }
  expect(rows.filter((r) => r.key !== null).length, 'kinds with a key show it').toBeGreaterThan(2)
  // The key is in the app's own face, not the browser's monospace.
  const face = (sel: string) =>
    page
      .locator(sel)
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily)
  expect(await face('[data-kind] kbd')).toBe(await face('h1'))
  // The whole body is the way in, not only the name.
  await kind(page, 'Reading').locator('[data-count]').click()
  await expect(page).toHaveURL(/\/reading$/)
})

test('a kind with nothing in it is still listed', async ({ page }) => {
  await registerFreshUser(page, '/things')
  await expect(kind(page, 'Reading')).toBeVisible()
  await expect(kind(page, 'Reading').locator('[data-count]')).toHaveText('0 to read')
  await expect(kind(page, 'Reading').locator('[data-status]')).toHaveCount(0)
})

test('each kind says how many, and what is current', async ({ page }) => {
  await registerFreshUser(page, '/things')
  await apiPost(page, '/reading', {
    kind: 'book',
    title: 'The Elements of Typographic Style',
  })
  await page.reload()
  await expect(kind(page, 'Reading').locator('[data-count]')).toHaveText('1 to read')
  await expect(kind(page, 'Reading').locator('[data-status]')).toHaveText('1 not in a project')
})

test('the rail entry for Things goes there', async ({ page }) => {
  await registerFreshUser(page, '/')
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Things' })
    .click()
  await expect(page).toHaveURL(/\/things$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Things' })).toBeVisible()
})

test('People says whose birthday is next, as a countdown', async ({ page }) => {
  await registerFreshUser(page, '/things')
  const soon = new Date()
  soon.setDate(soon.getDate() + 3)
  await apiPost(page, '/people', {
    name: '妈妈',
    birthday: { calendar: 'solar', month: soon.getMonth() + 1, day: soon.getDate() },
  })
  await page.reload()
  await expect(kind(page, 'People').locator('[data-status]')).toHaveText(
    'Next birthday: 妈妈 in 3 days',
  )
})

test('People counts in its own words, as every other kind does', async ({ page }) => {
  await registerFreshUser(page, '/things')
  await expect(kind(page, 'People').locator('[data-count]')).toHaveText('0 people')
  await apiPost(page, '/people', { name: '陈颖' })
  await page.reload()
  await expect(kind(page, 'People').locator('[data-count]')).toHaveText('1 person')
})

test('key hints are shown only where the keys work', async ({ page }) => {
  await registerFreshUser(page, '/things')
  await expect(kind(page, 'People').locator('kbd')).toBeVisible()

  // With single-key shortcuts switched off, a `g n` beside People would be a promise the page
  // does not keep.
  await page.evaluate(() => localStorage.setItem('ctws.shortcuts.enabled', '0'))
  await page.reload()
  await expect(kind(page, 'People')).toBeVisible()
  await expect(page.locator('main kbd')).toHaveCount(0)
  await expect(page.getByRole('banner').locator('kbd', { hasText: '/' })).toHaveCount(0)
  await page.getByRole('banner').getByRole('button', { name: 'Search' }).click()
  const dialog = page.getByRole('dialog', { name: 'Search' })
  await expect(dialog.getByRole('option', { name: /^People/ })).toBeVisible()
  await expect(dialog.locator('kbd')).toHaveCount(0)
})

test('on a phone, where there is no keyboard to press them, no key hints show', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await registerFreshUser(page, '/things')
  await expect(kind(page, 'People')).toBeVisible()
  await expect(page.locator('kbd:visible')).toHaveCount(0)
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Search' })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Search' })
  await expect(dialog.getByRole('option', { name: /^People/ })).toBeVisible()
  await expect(dialog.locator('kbd:visible')).toHaveCount(0)
})

/** Projects says how many lines of work are live, and how many are set aside. */
test('Projects counts the archived ones apart', async ({ page }) => {
  await registerFreshUser(page, '/things')
  const made = await apiPost(page, '/projects', { name: '旧的' })
  const { id } = made
  const res = await page.request.patch(`/api/v1/projects/${id}`, {
    headers: WEB,
    data: { archived: true },
  })
  expect(res.ok(), await res.text()).toBe(true)
  await page.reload()
  await expect(kind(page, 'Projects').locator('[data-count]')).toHaveText('1 active')
  await expect(kind(page, 'Projects').locator('[data-status]')).toHaveText('1 archived')
})

test('the next meeting moves on once the one named has started', async ({ page }) => {
  await registerFreshUser(page)
  const zone = await accountZone(page)
  await meetingToday(page, 'Standup', '10:00', zone)
  await meetingToday(page, 'Review', '11:00', zone)
  const [y, m, d] = dayInZone(zone).split('-').map(Number) as [number, number, number]
  await page.clock.install({ time: new TZDate(y, m - 1, d, 9, 50, 0, 0, zone) })
  await page.goto('/things')
  const status = kind(page, 'Meetings').locator('[data-status]')
  await expect(status).toHaveText('Next: Standup at 10:00')
  await page.clock.fastForward('15:00')
  await expect(status).toHaveText('Next: Review at 11:00')
})
