import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  apiPost,
  makeProject,
  makeTask,
  registerFreshUser,
  surfaceLuminance,
  textContrast,
} from './helpers'

/**
 * WHAT SITS ON A PLANE IS DRAWN ONE STEP FROM IT, IN BOTH SCHEMES.
 *
 * In dark the highlighted search result is lighter than the dialog it sits in, a menu opened over
 * the overlay pane is not darker than the pane, and in both schemes a board card is lighter than
 * its column.
 */

const bg = (l: Locator) => l.evaluate((el) => getComputedStyle(el).backgroundColor)

async function dark(page: Page) {
  await page.emulateMedia({ colorScheme: 'dark' })
}

test('in dark, the selected search result stands out', async ({ page }) => {
  await registerFreshUser(page)
  await apiPost(page, '/people', { name: 'Sam Patel', org: 'IQBank' })
  await dark(page)
  await page.getByRole('button', { name: /^Search everything/ }).click()
  await page.getByRole('combobox', { name: 'Search' }).fill('Sam')
  const dialog = page.getByRole('dialog', { name: 'Search' })
  const chosen = dialog.locator('[role="option"][aria-selected="true"]')
  await expect(chosen).toContainText('Sam Patel')
  const panel = chosen.locator('xpath=ancestor::*[@role="dialog"][1]')
  expect(await bg(chosen)).not.toBe('rgba(0, 0, 0, 0)')
  expect(await surfaceLuminance(chosen)).toBeGreaterThan(await surfaceLuminance(panel))
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
  expect(await surfaceLuminance(menu)).toBeGreaterThanOrEqual(await surfaceLuminance(pane))
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
  expect(await surfaceLuminance(pane)).toBeGreaterThan(
    await surfaceLuminance(page.getByRole('main')),
  )
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
    expect(await surfaceLuminance(card)).toBeGreaterThan(await surfaceLuminance(column))
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
    const { id } = await apiPost(page, '/people', {
      name: '陈颖',
      title: 'Recruiter',
      org: 'Acme',
      city: 'Toronto',
      birthday: { calendar: 'solar', month: 3, day: 9 },
    })

    // The rail's current project, and its count.
    await page.goto(`/projects/${pid}`)
    const count = page
      .getByRole('navigation', { name: 'Projects' })
      .locator(`a[href="/projects/${pid}"] [data-count]`)
    expect(await textContrast(count), 'rail count').toBeGreaterThanOrEqual(4.5)

    // The open person's row in the sidebar, selected.
    await page.goto(`/people/${id}`)
    const row = page.locator(`[data-person-row="${id}"] a`)
    await expect(row).toHaveAttribute('aria-current', 'page')
    expect(await textContrast(row.getByText('陈颖')), 'name').toBeGreaterThanOrEqual(4.5)

    // The birthdays in the sidebar, and how far off each is.
    await page.goto('/people?list=birthdays')
    const day = page.locator(`[data-birthday-row="${id}"]`).getByText(/\d+ d$/)
    expect(await textContrast(day), 'days').toBeGreaterThanOrEqual(4.5)
  })
}
