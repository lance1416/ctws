import { expect, test, type Locator, type Page } from '@playwright/test'
import { makeProject, makeTask, registerFreshUser } from './helpers'

/**
 * A BOX ONLY FOR WHAT FLOATS.
 *
 * Every block used to be a rounded, bordered, shadowed card, which is the look this redesign set
 * out to leave: a page of identical boxes says nothing about which of them matter. Now a section
 * of a page is just its heading and its rows; the only boxes are things above the page (the
 * sheet, menus, dialogs) and the Workbench's tiles, which sit on a desk of their own.
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

test('a section of a page is not a box', async ({ page }) => {
  await registerFreshUser(page)
  // Signing up passes through the Workbench, whose cards ARE boxes: measure Today's, not those.
  await expect(page.locator('#today-heading')).toBeVisible()
  await expect(page.locator('[data-panel="In progress"]')).toBeVisible()
  const section = page.getByRole('main').locator('[data-panel]').first()
  await expect(section).toBeVisible()
  expect(await style(section)).toEqual({
    fill: 'rgba(0, 0, 0, 0)',
    border: '0px',
    radius: '0px',
    shadow: 'none',
  })
})

test('the Workbench is a desk, and its cards are tiles on it', async ({ page }) => {
  await registerFreshUser(page, '/')
  const tile = page.getByRole('main').locator('[data-panel]').first()
  await expect(tile).toBeVisible()
  expect(await style(page.getByRole('main'))).toMatchObject({ fill: await token(page, 'desk') })
  expect(await style(tile)).toEqual({
    fill: await token(page, 'sheet'),
    border: '0px',
    radius: '10px',
    shadow: 'none',
  })
  // Leaving it gives the page back its sheet.
  await page.goto('/things')
  expect(await style(page.getByRole('main'))).toMatchObject({ fill: await token(page, 'sheet') })
})

test('the sheet floats 12px in from the window and under the header, with a 10px radius', async ({
  page,
}) => {
  const pane = await openTask(page, 'light')
  const box = (await pane.boundingBox())!
  const header = (await page.getByRole('banner').boundingBox())!
  expect(Math.round(1440 - (box.x + box.width))).toBe(12)
  expect(Math.round(box.y - (header.y + header.height))).toBe(12)
  expect(Math.round(900 - (box.y + box.height))).toBe(12)
  const s = await style(pane)
  expect(s.radius).toBe('10px')
  expect(s.border).toBe('0px')
})

test('a float is lifted by a shadow in light, and edged by a rule in dark', async ({ page }) => {
  const light = await openTask(page, 'light')
  // The hairline ring, and the soft fall under it.
  expect((await style(light)).shadow).toMatch(/0px 0px 0px 1px.*0px 16px 40px -12px/)

  await page.emulateMedia({ colorScheme: 'dark' })
  const rule = await token(page, 'rule')
  // No fall in dark -- a shadow on a near-black ground is invisible -- only the 1px edge. (The
  // computed value leads with Tailwind's transparent ring placeholders; the lift is the tail.)
  const dark = (await style(light)).shadow
  expect(dark.endsWith(`${rule} 0px 0px 0px 1px`), dark).toBe(true)
  expect(dark).not.toContain('40px')
})
