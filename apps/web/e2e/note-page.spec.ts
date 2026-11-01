import { expect, test, type Page } from '@playwright/test'
import { apiPost, registerFreshUser, WEB } from './helpers'

/**
 * A NOTE'S WHOLE PAGE (REQ-002 FR-109, FR-116, artboards 37 and 39): the text across the main
 * area, the outline a panel on its right that folds away, where the cursor is in the status bar,
 * and the note's source a press away. What is chosen is kept with the account.
 */

const NOTE = ['Words first.', '', '## Before', '', 'Some **bold** words.', '', '## After', 'End.']

const panel = (page: Page) => page.getByRole('complementary').filter({ hasText: 'Outline' })
const outlineSwitch = (page: Page) => page.getByRole('button', { name: 'Outline', exact: true })
const sourceSwitch = (page: Page) => page.getByRole('button', { name: 'Source', exact: true })
const place = (page: Page) => page.locator('footer[aria-label="Status"] [data-editor-place]')

async function openNote(page: Page, lines: readonly string[] = NOTE): Promise<string> {
  const note = await apiPost<{ id: string }>(page, '/notes', {
    title: 'Prep',
    body: lines.join('\n'),
  })
  await page.goto(`/notes/${note.id}`)
  await expect(page.locator('[data-markdown-editor] .cm-content')).toBeVisible()
  return note.id
}

async function stored(page: Page, id: string): Promise<string> {
  const res = await page.request.get(`/api/v1/notes/${id}`)
  return ((await res.json()) as { body: string }).body
}

test('the outline is a panel on the right that folds away four ways, kept with the account', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await registerFreshUser(page)
  await openNote(page)
  await expect(panel(page)).toBeVisible()
  expect((await panel(page).boundingBox())!.width).toBe(260)
  await expect(outlineSwitch(page)).toHaveAttribute('aria-pressed', 'true')

  // The title row's switch, then the panel's own », then ] with nothing being typed.
  await outlineSwitch(page).click()
  await expect(panel(page)).toHaveCount(0)
  await expect(outlineSwitch(page)).toHaveAttribute('aria-pressed', 'false')
  await outlineSwitch(page).click()
  await panel(page).getByRole('button', { name: 'Hide the outline' }).click()
  await expect(panel(page)).toHaveCount(0)
  // Nothing being typed in: the editor lets go of the focus.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press(']')
  await expect(panel(page)).toBeVisible()

  // Ctrl Alt B from inside the editor, and Ctrl \ (which of the two stays is Safari's to say).
  await page.locator('[data-markdown-editor] .cm-line').filter({ hasText: 'End.' }).click()
  await page.keyboard.press('Control+Alt+b')
  await expect(panel(page)).toHaveCount(0)
  await page.keyboard.press('Control+Backslash')
  await expect(panel(page)).toBeVisible()
  await page.keyboard.press('Control+Alt+b')
  await expect(panel(page)).toHaveCount(0)

  // Kept with the account: hidden on the next note, and after a reload.
  await openNote(page)
  await expect(outlineSwitch(page)).toHaveAttribute('aria-pressed', 'false')
  await page.reload()
  await expect(outlineSwitch(page)).toHaveAttribute('aria-pressed', 'false')
  await expect(panel(page)).toHaveCount(0)
})

test('with no headings there is no outline panel and no switch for it', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await registerFreshUser(page)
  await openNote(page, ['Only words.'])
  await expect(panel(page)).toHaveCount(0)
  await expect(outlineSwitch(page)).toHaveCount(0)
})

test('the text takes the main area: past the old reading measure, up to the outline', async ({
  page,
}) => {
  await page.setViewportSize({ width: 2000, height: 900 })
  await registerFreshUser(page)
  await openNote(page)
  const text = (await page.locator('[data-markdown-editor]').boundingBox())!
  const side = (await panel(page).boundingBox())!
  // 40 to the panel's edge.
  expect(Math.round(side.x - (text.x + text.width))).toBe(40)
  expect(text.width).toBeGreaterThan(1000)
})

test('narrow, the outline starts hidden; shown, it floats over the text until Esc', async ({
  page,
}) => {
  // The main area under 900, as it is when the browser is zoomed in (Ctrl +) beside the sidebar.
  await page.setViewportSize({ width: 1280, height: 800 })
  await registerFreshUser(page)
  await openNote(page)
  await page.evaluate(() => (document.documentElement.style.zoom = '1.25'))
  await expect(panel(page)).toHaveCount(0)
  await outlineSwitch(page).click()
  await expect(panel(page)).toBeVisible()
  await expect(panel(page)).toHaveCSS('position', 'absolute')
  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
  // The account's choice is untouched: wide again, it is shown.
  await page.evaluate(() => (document.documentElement.style.zoom = ''))
  await expect(panel(page)).toBeVisible()
})

test('the outline marks the section in sight as the page scrolls; at the top, the first', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 700 })
  await registerFreshUser(page)
  const filler = Array.from({ length: 30 }, (_, i) => `Line ${i + 1}.`)
  await openNote(page, ['## First', ...filler, '## Second', ...filler, '## Last', 'End.'])
  const marked = panel(page).locator('[aria-current="location"]')
  await expect(marked).toHaveText('First')
  await page
    .locator('[data-markdown-editor] .cm-line')
    .filter({ hasText: 'Second' })
    .scrollIntoViewIfNeeded()
  await page.getByRole('main').evaluate((el) => el.scrollBy(0, 200))
  await expect(marked).not.toHaveText('First')
  await page.getByRole('main').evaluate((el) => el.scrollTo(0, 0))
  await expect(marked).toHaveText('First')
})

test('the status bar says where the cursor is without vim, and Source when it shows it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await registerFreshUser(page)
  await openNote(page)
  await page.locator('[data-markdown-editor] .cm-line').filter({ hasText: 'End.' }).click()
  await page.keyboard.press('End')
  await expect(place(page)).toHaveText('Ln 8, Col 5')
  await page.keyboard.press('Control+Shift+V')
  await expect(place(page)).toHaveText(/Ln 8, Col 5\s*Source/)
  await page.getByRole('textbox', { name: 'Title' }).click()
  await expect(place(page)).toHaveCount(0)
})

test('the source: every mark shown in mono, written in, and kept with the account', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await registerFreshUser(page)
  const id = await openNote(page)
  const bold = page.locator('[data-markdown-editor] .cm-line').filter({ hasText: 'Some' })
  await expect(bold).toHaveText('Some bold words.')
  await sourceSwitch(page).click()
  await expect(sourceSwitch(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(bold).toHaveText('Some **bold** words.')
  await expect(page.locator('[data-markdown-editor] .cm-src')).toBeVisible()
  await expect(page.locator('[data-markdown-editor] .cm-scroller')).toHaveCSS(
    'font-family',
    /JetBrains Mono/,
  )
  // Written in the same way.
  await bold.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' More.')
  await expect.poll(() => stored(page, id)).toContain('Some **bold** words. More.')
  // Kept: the next note opens in it, until it is switched back from the menu.
  await page.reload()
  await expect(sourceSwitch(page)).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await page.getByRole('menuitem', { name: /Show it drawn/ }).click()
  await expect(bold).toHaveText('Some bold words. More.')
})

test('the source keeps the cursor on its line and the line where it was on the screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await registerFreshUser(page)
  // Long enough to scroll either way: the page is what moves to keep the line still.
  const filler = Array.from({ length: 40 }, (_, i) => `Line ${i + 1}.`)
  await openNote(page, [...filler.slice(0, 12), ...NOTE, ...filler])
  const line = page.locator('[data-markdown-editor] .cm-line').filter({ hasText: 'End.' })
  await page.getByRole('main').evaluate((el) => el.scrollBy(0, 300))
  await line.click()
  const before = (await line.boundingBox())!.y
  await page.keyboard.press('Control+Shift+V')
  await expect(page.locator('[data-markdown-editor] .cm-src')).toBeVisible()
  await expect(page.locator('[data-markdown-editor] .cm-activeLine')).toHaveText('End.')
  // Once the mono face has arrived (fetched on first use) and the lines are its height.
  await expect
    .poll(async () => Math.abs((await line.boundingBox())!.y - before))
    .toBeLessThanOrEqual(1)
})

test('Ctrl Shift V only switches the view: nothing is pasted with it', async ({
  page,
  browserName,
  context,
}) => {
  test.skip(browserName !== 'chromium', 'the clipboard is written through Chromium’s permission')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.setViewportSize({ width: 1600, height: 900 })
  await registerFreshUser(page)
  const id = await openNote(page)
  await page.evaluate(() => navigator.clipboard.writeText('PASTED'))
  await page.locator('[data-markdown-editor] .cm-line').filter({ hasText: 'End.' }).click()
  await page.keyboard.press('Control+Shift+V')
  await expect(page.locator('[data-markdown-editor] .cm-src')).toBeVisible()
  await page.keyboard.press('Control+Shift+V')
  await expect(page.locator('[data-markdown-editor] .cm-src')).toHaveCount(0)
  // A pause longer than the save's, then the note as kept.
  await page.waitForTimeout(1200)
  expect(await stored(page, id)).not.toContain('PASTED')
})

test('Readable keeps the lines to a readable length, in the middle of the page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 2000, height: 900 })
  await registerFreshUser(page)
  const res = await page.request.patch('/api/v1/auth/me', {
    headers: WEB,
    data: { readableLines: true },
  })
  expect(res.ok()).toBe(true)
  await openNote(page)
  const text = (await page.locator('[data-markdown-editor]').boundingBox())!
  // 45 of the text's 15: 675, the editor's own half rem either side within it.
  expect(text.width).toBeLessThanOrEqual(676)
  const main = (await page.getByRole('main').boundingBox())!
  const side = (await panel(page).boundingBox())!
  const left = text.x - main.x
  const right = side.x - (text.x + text.width)
  expect(Math.abs(left - right)).toBeLessThanOrEqual(2)
})

test('the account page switches the line length, Full by default', async ({ page }) => {
  await registerFreshUser(page, '/account')
  const length = page.getByRole('radiogroup', { name: 'Line length' })
  await expect(length.getByRole('radio', { name: 'Full' })).toBeChecked()
  await length.getByRole('radio', { name: 'Readable' }).click()
  await page.reload()
  await expect(
    page.getByRole('radiogroup', { name: 'Line length' }).getByRole('radio', { name: 'Readable' }),
  ).toBeChecked()
})
