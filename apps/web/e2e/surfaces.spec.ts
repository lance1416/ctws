import { expect, test, type Locator, type Page } from '@playwright/test'
import { apiPost, makeProject, makeTask, registerFreshUser, textContrast } from './helpers'

/**
 * WHAT SITS ON A PLANE IS DRAWN ONE STEP FROM IT, IN BOTH SCHEMES.
 *
 * Three things the UI audit measured: in dark, the highlighted search result was the same colour
 * as the dialog it sat in; a menu opened over the overlay pane was darker than the pane; and a
 * board card was a hole in its column in dark but paper on it in light.
 */

/** Relative luminance of a computed `rgb()`/`rgba()`, with an alpha fill laid over `under`. */
async function lum(l: Locator, under?: Locator) {
  const [own, base] = await Promise.all([
    l.evaluate((el) => getComputedStyle(el).backgroundColor),
    under ? under.evaluate((el) => getComputedStyle(el).backgroundColor) : Promise.resolve(null),
  ])
  const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number)
  const [r, g, b, a = 1] = parse(own)
  const [br, bg, bb] = base ? parse(base) : [0, 0, 0]
  const mix = (x: number, y: number) => x * a + y * (1 - a)
  const ch = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * ch(mix(r!, br!)) + 0.7152 * ch(mix(g!, bg!)) + 0.0722 * ch(mix(b!, bb!))
}

const bg = (l: Locator) => l.evaluate((el) => getComputedStyle(el).backgroundColor)

async function dark(page: Page) {
  await page.emulateMedia({ colorScheme: 'dark' })
}

test('in dark, the selected search result stands out', async ({ page }) => {
  await registerFreshUser(page)
  await apiPost(page, '/people', { name: 'Sam Patel', org: 'IQBank' })
  await dark(page)
  await page.getByRole('button', { name: 'Search' }).click()
  await page.getByRole('combobox', { name: 'Search' }).fill('Sam')
  const dialog = page.getByRole('dialog', { name: 'Search' })
  const chosen = dialog.locator('[role="option"][aria-selected="true"]')
  await expect(chosen).toContainText('Sam Patel')
  // The dialog's own panel: the nearest ancestor that paints.
  const panel = chosen.locator('xpath=ancestor::*[@role="dialog"][1]')
  expect(await bg(chosen)).not.toBe('rgba(0, 0, 0, 0)')
  expect(await lum(chosen, panel)).toBeGreaterThan(await lum(panel))
})

test('a menu opened over the overlay pane is not darker than the pane', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 })
  await registerFreshUser(page)
  const pid = await makeProject(page, 'IQBank')
  await makeTask(page, pid, 'Ship the importer')
  await dark(page)
  await page.goto(`/projects/${pid}`)
  await page.getByRole('listitem').filter({ hasText: 'Ship the importer' }).first().click()
  // A CSS locator, not a role: an open Radix menu hides everything else from the accessibility
  // tree, so the pane stops answering `getByRole` the moment the menu is up.
  const pane = page.locator('[role="dialog"][aria-label="Task details"]')
  await pane.getByRole('button', { name: /^Status:/ }).click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  expect(await lum(menu)).toBeGreaterThanOrEqual(await lum(pane))
})

test('in dark, a floating surface is lighter than the paper under it', async ({ page }) => {
  // Dark has no shadows: a float is told from the sheet under it by being lighter, and by
  // nothing else. A float the colour of the page is a pane with no edge.
  await page.setViewportSize({ width: 1440, height: 900 })
  await registerFreshUser(page)
  const pid = await makeProject(page, 'IQBank')
  await makeTask(page, pid, 'Ship the importer')
  await dark(page)
  await page.goto(`/projects/${pid}`)
  await page.getByRole('listitem').filter({ hasText: 'Ship the importer' }).first().click()
  const pane = page.locator('[role="dialog"][aria-label="Task details"]')
  await expect(pane).toBeVisible()
  expect(await lum(pane)).toBeGreaterThan(await lum(page.getByRole('main')))
})

for (const scheme of ['light', 'dark'] as const) {
  test(`a board card is lighter than its column (${scheme})`, async ({ page }) => {
    await registerFreshUser(page)
    const pid = await makeProject(page, 'IQBank')
    await makeTask(page, pid, 'Write the migration', { status: 'todo' })
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto(`/projects/${pid}`)
    await page.getByText('Board', { exact: true }).click()
    const card = page.locator('[data-board-card]').first()
    await expect(card).toBeVisible()
    const column = card.locator('xpath=ancestor::section[@data-board-column][1]')
    expect(await lum(card)).toBeGreaterThan(await lum(column))
  })
}

/**
 * A SELECTION IS A STATE THAT STAYS, so text on it is held to 4.5:1 like any other text. The
 * tertiary ink clears that on every plane but not on the `select` layer over it, so what sits on a
 * selected surface reads one step up. Light and dark, on each kind of selected surface.
 */
for (const scheme of ['light', 'dark'] as const) {
  test(`${scheme}: text on a selected surface clears 4.5:1`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.setViewportSize({ width: 1440, height: 900 })
    await registerFreshUser(page)
    const pid = await makeProject(page, '找工作')
    await makeTask(page, pid, '一条')
    const made = await page.request.post('/api/v1/people', {
      headers: { 'x-ctws-client': 'web' },
      data: {
        name: '陈颖',
        title: 'Recruiter',
        org: 'Acme',
        city: 'Toronto',
        birthday: { calendar: 'solar', month: 3, day: 9 },
      },
    })
    const id = ((await made.json()) as { id: string }).id

    // The rail's current project, and its count.
    await page.goto(`/projects/${pid}`)
    const count = page
      .getByRole('navigation', { name: 'Main navigation' })
      .locator(`a[href="/projects/${pid}"] [data-count]`)
    expect(await textContrast(count), 'rail count').toBeGreaterThanOrEqual(4.5)

    // The open person's row: what they do, and their city.
    await page.goto(`/people/${id}`)
    const row = page.locator(`[data-person-row="${id}"]`)
    expect(await textContrast(row.locator('[data-person-meta]')), 'meta').toBeGreaterThanOrEqual(
      4.5,
    )
    expect(await textContrast(row.getByText('Toronto')), 'city').toBeGreaterThanOrEqual(4.5)

    // A picked month on Birthdays, and its count.
    await page.goto('/people/birthdays')
    await page.getByRole('button', { name: /^March/ }).click()
    const month = page.getByRole('button', { name: /^March/ })
    await expect(month).toHaveAttribute('aria-pressed', 'true')
    expect(await textContrast(month.locator('span')), 'month count').toBeGreaterThanOrEqual(4.5)
  })
}
