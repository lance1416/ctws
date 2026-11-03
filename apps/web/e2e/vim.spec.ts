import { expect, test, type Page } from '@playwright/test'
import { apiPost, editorText, makeProject, makeTask, registerFreshUser, WEB } from './helpers'

/**
 * Vim's keys in the editor: off unless the account turns them on; then every editor on a desk
 * takes them, its mode at the left of the status bar while it has the focus. Esc goes back to
 * NORMAL first; in NORMAL it closes what is open.
 */

const mode = (page: Page) => page.locator('footer[aria-label="Status"] [data-vim-mode]')

async function vimOn(page: Page) {
  await page.goto('/account')
  const keys = page.getByRole('radiogroup', { name: 'Vim keys' })
  await expect(keys.getByRole('radio', { name: 'Off' })).toBeChecked()
  await keys.getByRole('radio', { name: 'On' }).click()
  await expect(page.getByText('Esc goes back to Normal first')).toBeVisible()
  // Kept with the account, not only in this browser.
  await expect
    .poll(
      async () =>
        ((await (await page.request.get('/api/v1/auth/me')).json()) as { vimKeys: boolean })
          .vimKeys,
    )
    .toBe(true)
}

async function openNote(page: Page, body: string): Promise<string> {
  const note = await apiPost<{ id: string }>(page, '/notes', { title: 'Prep', body })
  await page.goto(`/notes/${note.id}`)
  await expect(page.getByRole('textbox', { name: 'Note' })).toBeVisible()
  return note.id
}

async function stored(page: Page, id: string): Promise<string> {
  const res = await page.request.get(`/api/v1/notes/${id}`)
  return ((await res.json()) as { body: string }).body
}

test('off, the editor is the editor: i is typed, and the status bar says nothing', async ({
  page,
}) => {
  await registerFreshUser(page)
  const id = await openNote(page, '')
  await page.locator('[data-markdown-editor] .cm-content').click()
  await page.keyboard.type('i am here')
  await expect.poll(() => stored(page, id)).toBe('i am here')
  await expect(mode(page)).toHaveCount(0)
})

test('on: NORMAL, i to INSERT, Esc back, dd deletes the line; the bar says where', async ({
  page,
}) => {
  await registerFreshUser(page)
  await vimOn(page)
  const id = await openNote(page, 'First line\nSecond line')
  const editor = page.getByRole('textbox', { name: 'Note' })
  await page.locator('[data-markdown-editor] .cm-line').first().click()
  await expect(mode(page)).toContainText('NORMAL')
  await page.keyboard.press('Escape')
  await page.keyboard.press('g')
  await page.keyboard.press('g')
  await expect(mode(page)).toContainText('Ln 1, Col 1')

  await page.keyboard.press('i')
  await expect(mode(page)).toContainText('INSERT')
  await page.keyboard.type('Now ')
  await page.keyboard.press('Escape')
  await expect(mode(page)).toContainText('NORMAL')
  await expect.poll(() => stored(page, id)).toBe('Now First line\nSecond line')

  await page.keyboard.press('d')
  await page.keyboard.press('d')
  await expect.poll(() => stored(page, id)).toBe('Second line')
  await page.keyboard.press('u')
  await expect.poll(() => editorText(editor)).toContain('Now First line')

  // Left for the title, the bar says nothing of the editor.
  await page.getByRole('textbox', { name: 'Title' }).click()
  await expect(mode(page)).toHaveCount(0)
})

test('on: Esc in INSERT stays in the meeting’s notes; in NORMAL it puts them away', async ({
  page,
}) => {
  await registerFreshUser(page)
  await vimOn(page)
  const made = await apiPost<{ meetingId: string }>(page, '/meetings', {
    title: 'Atlas weekly',
    startsLocal: '2026-09-11T10:30',
    timeZone: 'Europe/London',
    durationMinutes: 30,
  })
  await page.goto(`/meetings/${made.meetingId}?at=2026-09-11T10:30`)
  await page
    .getByRole('button', { name: /Write|Edit the notes/ })
    .first()
    .click()
  const notes = page.getByRole('textbox', { name: 'Notes for this meeting' })
  await expect(page.locator('[data-markdown-editor] .cm-content')).toBeVisible()
  await expect(mode(page)).toContainText('NORMAL')
  await page.keyboard.press('i')
  await page.keyboard.type('Launch stays')
  await page.keyboard.press('Escape')
  await expect(mode(page)).toContainText('NORMAL')
  await expect(notes).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(notes).toHaveCount(0)
})

test('on: Esc in INSERT stays in full screen and in the task’s pane; in NORMAL it closes', async ({
  page,
}) => {
  await registerFreshUser(page)
  await vimOn(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '读一下', { notes: 'Words' })
  await page.goto(`/projects/${pid}`)
  await page.getByRole('listitem').filter({ hasText: '读一下' }).first().click()
  const pane = page.getByRole('dialog', { name: 'Task details' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Full screen' }).click()
  const layer = page.getByRole('dialog', { name: '读一下' })
  await expect(layer.locator('[data-markdown-editor] .cm-content')).toBeVisible()
  // Vim's keys arrive after the editor (fetched on first use): an i before them is typed.
  await expect(mode(page)).toContainText('NORMAL')
  await page.keyboard.press('i')
  await expect(mode(page)).toContainText('INSERT')
  await page.keyboard.press('Escape')
  await expect(mode(page)).toContainText('NORMAL')
  await expect(layer).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(layer).toHaveCount(0)

  // In the pane's own notes: the first Esc is vim's, the second the pane's.
  await page.getByRole('textbox', { name: 'Notes', exact: true }).click()
  await page.keyboard.press('i')
  await page.keyboard.press('Escape')
  await expect(mode(page)).toContainText('NORMAL')
  await expect(pane).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(pane).toHaveCount(0)
})

test('on: Ctrl F is the note’s find and Ctrl K search, not vim’s paging', async ({ page }) => {
  await registerFreshUser(page)
  await vimOn(page)
  await openNote(page, 'A ledger.\n\nThe ledger.')
  await page.locator('[data-markdown-editor] .cm-line').first().click()
  await page.keyboard.press('ControlOrMeta+f')
  await expect(page.getByRole('search', { name: 'Find in this note' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog', { name: 'Search' })).toBeVisible()
})

test('a phone has no vim, whatever the account says', async ({ page }) => {
  await registerFreshUser(page)
  await page.request.patch('/api/v1/auth/me', { headers: WEB, data: { vimKeys: true } })
  await page.setViewportSize({ width: 393, height: 852 })
  const id = await openNote(page, '')
  await page.getByRole('textbox', { name: 'Note' }).click()
  await page.keyboard.type('i typed')
  await expect.poll(() => stored(page, id)).toBe('i typed')
})

test('on: with the @ list open, Esc closes the list and stays in INSERT; the next is NORMAL', async ({
  page,
}) => {
  await registerFreshUser(page)
  await vimOn(page)
  await apiPost(page, '/people', { name: 'Mira Chen' })
  await openNote(page, 'Ask')
  await page.locator('[data-markdown-editor] .cm-line').first().click()
  await page.keyboard.press('A')
  await page.keyboard.type(' @Mi')
  const list = page.getByRole('listbox')
  await expect(list.getByRole('option').first()).toContainText('Mira Chen')
  await page.keyboard.press('Escape')
  await expect(list).toHaveCount(0)
  await expect(mode(page)).toContainText('INSERT')
  await page.keyboard.press('Escape')
  await expect(mode(page)).toContainText('NORMAL')
})

test('on: j and k move one line at a time past a code block, a table and a formula', async ({
  page,
}) => {
  await registerFreshUser(page)
  await vimOn(page)
  for (const block of [
    ['```js', 'code one', 'code two', '```'],
    ['| A | B |', '| - | - |', '| 1 | 2 |'],
    ['$$', 'x^2', '$$'],
  ]) {
    const id = await openNote(
      page,
      ['# H', 'para', '', ...block, '', '## Heading two', 'last line'].join('\n'),
    )
    const typedOn = async (letter: string) =>
      (await stored(page, id))
        .split('\n')
        .find((l) => l.includes(letter))
        ?.replace(letter, '')
    await page.locator('[data-markdown-editor] .cm-line').filter({ hasText: 'last line' }).click()
    await expect(mode(page)).toContainText('NORMAL')
    await page.keyboard.press('k')
    await page.keyboard.type('IX')
    await page.keyboard.press('Escape')
    await expect.poll(() => typedOn('X'), block[0]).toBe('## Heading two')
    // Down from the line above the block: the blank line, then the block's first line.
    await page.locator('[data-markdown-editor] .cm-line').filter({ hasText: 'para' }).click()
    await page.keyboard.press('j')
    await page.keyboard.press('j')
    await page.keyboard.type('IY')
    await page.keyboard.press('Escape')
    await expect.poll(() => typedOn('Y'), block[0]).toBe(block[0])
  }
})
