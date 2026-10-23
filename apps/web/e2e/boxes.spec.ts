import { expect, test, type Locator, type Page } from '@playwright/test'
import { makeProject, makeTask, registerFreshUser } from './helpers'

/**
 * A BOX ONLY FOR WHAT FLOATS.
 *
 * A page of identical boxes says nothing about which of them matter, so a section of a page is
 * just its heading and its rows; the only boxes are things above the page (the sheet, menus,
 * dialogs) and the Workbench's tiles, which sit on a desk of their own.
 */

/** The computed colour of a token, as `getComputedStyle` reports a fill. */
const token = (page: Page, name: string) =>
  page.evaluate((n) => {
    const probe = document.createElement('div')
    probe.style.backgroundColor = `var(--color-${n})`
    document.body.appendChild(probe)
    const c = getComputedStyle(probe).backgroundColor
    probe.remove()
    return c
  }, name)

const style = (l: Locator) =>
  l.evaluate((el) => {
    const s = getComputedStyle(el)
    return {
      fill: s.backgroundColor,
      border: s.borderTopWidth,
      radius: s.borderTopLeftRadius,
      shadow: s.boxShadow,
    }
  })

async function openTask(page: Page, scheme: 'light' | 'dark') {
  await page.setViewportSize({ width: 1440, height: 900 })
  await registerFreshUser(page)
  const pid = await makeProject(page, 'IQBank')
  await makeTask(page, pid, 'Ship the importer')
  await page.emulateMedia({ colorScheme: scheme })
  await page.goto(`/projects/${pid}`)
  await page.getByRole('listitem').filter({ hasText: 'Ship the importer' }).first().click()
  const pane = page.locator('[role="dialog"][aria-label="Task details"]')
  await expect(pane).toBeVisible()
  return pane
}

test('the Workbench is the ground, and its cards are tiles on it', async ({ page }) => {
  await registerFreshUser(page, '/')
  const tile = page.getByRole('main').locator('[data-panel]').first()
  await expect(tile).toBeVisible()
  // Every page lies on the ground (FR-005); blocks and tiles are panels on it.
  expect(await style(page.getByRole('main'))).toMatchObject({ fill: await token(page, 'ground') })
  expect(await style(tile)).toEqual({
    fill: await token(page, 'panel'),
    border: '0px',
    radius: '10px',
    shadow: 'none',
  })
})

test('beside the page, the inspector is its right edge from under the header to the floor', async ({
  page,
}) => {
  // Artboard 8 (I-08): a column, not a card floating 12px in with rounded corners.
  const pane = await openTask(page, 'light')
  const box = (await pane.boundingBox())!
  const header = (await page.getByRole('banner').boundingBox())!
  expect(Math.round(1440 - (box.x + box.width))).toBe(0)
  expect(Math.round(box.y - (header.y + header.height))).toBe(0)
  expect(Math.round(900 - (box.y + box.height))).toBe(0)
  const s = await style(pane)
  expect(s.radius).toBe('0px')
  expect(s.border).toBe('0px')
})

test('a float is lifted by a ring and a soft fall, in both schemes (tokens.md)', async ({
  page,
}) => {
  const light = await openTask(page, 'light')
  // The hairline ring, and the soft fall under it.
  expect((await style(light)).shadow).toMatch(/0px 0px 0px 1px.*0px 8px 28px 0px/)

  await page.emulateMedia({ colorScheme: 'dark' })
  // Dark rings it with a visible edge and keeps a deeper fall. (The computed value leads with
  // Tailwind's transparent ring placeholders; the lift is the tail.)
  const dark = (await style(light)).shadow
  expect(dark, dark).toContain(`${await token(page, 'float-ring')} 0px 0px 0px 1px`)
  expect(dark).toContain('0px 8px 28px 0px')
})
