import { expect, test, type Locator, type Page } from '@playwright/test'
import { makeProject, makeTask, registerFreshUser } from './helpers'

/**
 * A page of identical boxes says nothing about which of them matter, so only what floats above
 * the page and the Workbench's widgets are boxed.
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

test('the Workbench is the ground, and its widgets are blocks on it', async ({ page }) => {
  await registerFreshUser(page, '/')
  const widget = page.getByRole('region', { name: 'Now', exact: true })
  await expect(widget).toBeVisible()
  // Every page lies on the ground; its widgets are panels with a hairline.
  expect(await style(page.getByRole('main'))).toMatchObject({ fill: await token(page, 'ground') })
  expect(await style(widget)).toEqual({
    fill: await token(page, 'panel'),
    border: '1px',
    radius: '8px',
    shadow: 'none',
  })
})

test('beside the page, the inspector is its right edge from under the header to the floor', async ({
  page,
}) => {
  // A column, not a card floating 12px in with rounded corners.
  const pane = await openTask(page, 'light')
  const box = (await pane.boundingBox())!
  const header = (await page.getByRole('banner').boundingBox())!
  expect(Math.round(1440 - (box.x + box.width))).toBe(0)
  expect(Math.round(box.y - (header.y + header.height))).toBe(0)
  // Down to the status bar, which stays in sight under it.
  expect(Math.round(900 - 24 - (box.y + box.height))).toBe(0)
  const s = await style(pane)
  expect(s.radius).toBe('0px')
  expect(s.border).toBe('0px')
})

test('a float is lifted by a ring and a soft fall, in both schemes', async ({ page }) => {
  const light = await openTask(page, 'light')
  expect((await style(light)).shadow).toMatch(/0px 0px 0px 1px.*0px 8px 28px 0px/)

  await page.emulateMedia({ colorScheme: 'dark' })
  // Dark rings it with a visible edge and keeps a deeper fall. (The computed value leads with
  // Tailwind's transparent ring placeholders; the lift is the tail.)
  const dark = (await style(light)).shadow
  expect(dark, dark).toContain(`${await token(page, 'float-ring')} 0px 0px 0px 1px`)
  expect(dark).toContain('0px 8px 28px 0px')
})
