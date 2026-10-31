import { expect, test, type Page } from '@playwright/test'
import { apiPost, editorText, makeProject, makeTask, navLink, registerFreshUser } from './helpers'

/**
 * THE MARKDOWN EDITOR on a note's page (REQ-002 FR-106 to FR-108, artboard 34). What is written is
 * checked where it is kept, the note on the server; what shows, in the editor's own lines.
 */

const editor = (page: Page) => page.getByRole('textbox', { name: 'Note' })
const lineOf = (page: Page, words: string) =>
  page.locator('[data-markdown-editor] .cm-line').filter({ hasText: words })

/** The note as the server keeps it, once the editor's last pause has been saved. */
async function stored(page: Page, id: string): Promise<string> {
  const res = await page.request.get('/api/v1/notes')
  const notes = (await res.json()) as
    { id: string; body: string }[] | { notes: { id: string; body: string }[] }
  const list = Array.isArray(notes) ? notes : notes.notes
  return list.find((n) => n.id === id)?.body ?? ''
}

async function openNote(page: Page, body: string): Promise<string> {
  const note = await apiPost<{ id: string }>(page, '/notes', { title: 'Prep', body })
  await page.goto(`/notes/${note.id}`)
  await expect(page.locator('[data-markdown-editor] .cm-content')).toBeVisible()
  return note.id
}

test('a heading reads as one off its line, and shows its ## on it (FR-106)', async ({ page }) => {
  await registerFreshUser(page)
  await openNote(page, 'First words.\n\n## Plan\n\nLast words.')
  await lineOf(page, 'Last words').click()
  await expect(lineOf(page, 'Plan')).toHaveText('Plan')
  await expect(lineOf(page, 'Plan')).toHaveClass(/cm-md-h2/)
  await lineOf(page, 'Plan').click()
  await expect(lineOf(page, 'Plan')).toHaveText('## Plan')
})

test('left for its title, a note reads whole: no line shows its marks (artboard 34)', async ({
  page,
}) => {
  await registerFreshUser(page)
  await openNote(page, '## Plan\n\nLast words.')
  await lineOf(page, 'Plan').click()
  await expect(lineOf(page, 'Plan')).toHaveText('## Plan')
  await page.getByRole('textbox', { name: 'Title' }).click()
  await expect(lineOf(page, 'Plan')).toHaveText('Plan')
})

test('what is typed is kept: lists go on, Ctrl B bolds, Ctrl Shift K links (FR-107)', async ({
  page,
}) => {
  await registerFreshUser(page)
  const id = await openNote(page, '- one')
  await lineOf(page, 'one').click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('two')
  // Enter on an empty item ends the list, the line kept; one more is the blank line after it.
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.type('soon')
  await page.keyboard.press('Shift+Home')
  await page.keyboard.press('ControlOrMeta+b')
  await page.keyboard.press('End')
  await page.keyboard.type(' and ')
  await page.keyboard.press('ControlOrMeta+Shift+k')
  await page.keyboard.type('docs')
  // The editor's press, not search's.
  await expect(page.getByRole('dialog', { name: 'Search' })).toHaveCount(0)
  await expect.poll(() => stored(page, id)).toBe('- one\n- two\n\n**soon** and [docs]()')
})

test('Ctrl K is still search everywhere, the editor too (FR-029)', async ({ page }) => {
  await registerFreshUser(page)
  await openNote(page, 'Words.')
  await lineOf(page, 'Words').click()
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog', { name: 'Search' })).toBeVisible()
})

test('a task box ticks where it is, and the note keeps it (FR-107)', async ({ page }) => {
  await registerFreshUser(page)
  const id = await openNote(page, '- [ ] Call\n\nEnd')
  await lineOf(page, 'End').click()
  await page.getByRole('checkbox', { name: 'Not done' }).click()
  await expect.poll(() => stored(page, id)).toBe('- [x] Call\n\nEnd')
  await expect(page.getByRole('checkbox', { name: 'Done' })).toBeChecked()
})

test('@ finds someone, keeps the link and draws its chip off the line (FR-108)', async ({
  page,
}) => {
  await registerFreshUser(page)
  const mira = await apiPost<{ id: string }>(page, '/people', {
    givenName: 'Mira',
    familyName: 'Chen',
  })
  const id = await openNote(page, 'Ask ')
  await lineOf(page, 'Ask').click()
  await page.keyboard.press('End')
  await page.keyboard.type('@Mi')
  const option = page.getByRole('option', { name: /Mira Chen/ })
  await expect(option).toBeVisible()
  // The list takes no Enter in its first moments open, so a quick one is not a pick by mistake
  // (CodeMirror's interactionDelay, 75ms).
  await page.waitForTimeout(100)
  await page.keyboard.press('Enter')
  await page.keyboard.type(' today')
  await expect.poll(() => stored(page, id)).toBe(`Ask [@Mira Chen](ctws://person/${mira.id}) today`)
  // On its line, the words as typed; off it, the chip.
  await expect(lineOf(page, 'Ask')).toContainText('@Mira Chen')
  await page.keyboard.press('Enter')
  await expect(
    page.locator(`[data-markdown-editor] [data-mention="person:${mira.id}"]`),
  ).toBeVisible()
})

test('a formula and a table are drawn off their lines', async ({ page }) => {
  await registerFreshUser(page)
  await openNote(page, 'Euler: $e^{i\\pi}$\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\nEnd')
  await lineOf(page, 'End').click()
  await expect(page.locator('[data-markdown-editor] .katex').first()).toBeVisible()
  await expect(page.locator('[data-markdown-editor] table.cm-md-table td').first()).toHaveText('1')
})

test('an IME’s commit is the words only: no line is added (REQ-002 §6)', async ({ page }) => {
  await registerFreshUser(page)
  const id = await openNote(page, '- one')
  await lineOf(page, 'one').click()
  await page.keyboard.press('End')
  const cdp = await page.context().newCDPSession(page)
  for (const t of ['s', 'sa', 'san'])
    await cdp.send('Input.imeSetComposition', {
      text: t,
      selectionStart: t.length,
      selectionEnd: t.length,
    })
  await cdp.send('Input.insertText', { text: '三' })
  await expect.poll(() => stored(page, id)).toBe('- one三')
})

test('a note emptied and left is kept empty (BUG-089, REQ-002 §6)', async ({ page }) => {
  await registerFreshUser(page)
  const id = await openNote(page, 'Gone soon')
  await lineOf(page, 'Gone soon').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Backspace')
  await expect.poll(() => editorText(editor(page))).toBe('')
  // Left from inside the app, at once: the last words are saved on the way out.
  await navLink(page, 'Today').click()
  await expect.poll(() => stored(page, id)).toBe('')
})

test('the editor’s code is fetched where a note is written, not where one is read', async ({
  page,
}) => {
  const asked: string[] = []
  page.on('request', (r) => asked.push(r.url()))
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, 'Read me', { notes: '**Read** only.' })
  await page.goto(`/projects/${pid}`)
  await page.getByRole('listitem').filter({ hasText: 'Read me' }).first().click()
  await expect(page.locator('[data-detail-notes] strong')).toHaveText('Read')
  expect(asked.filter((u) => u.includes('MarkdownEditor'))).toEqual([])
  await openNote(page, 'Written')
  expect(asked.some((u) => u.includes('MarkdownEditor'))).toBe(true)
})

test('the outline lists a note’s headings; a press jumps to one and marks it (FR-109)', async ({
  page,
}) => {
  await registerFreshUser(page)
  const sections = ['One', 'Two', 'Three', 'Four', 'Five']
  await openNote(page, sections.map((s) => `## ${s}\n\n${'words\n\n'.repeat(12)}`).join(''))
  const outline = page.getByRole('navigation', { name: 'Outline' })
  await expect(outline.getByRole('button')).toHaveText(sections)
  await outline.getByRole('button', { name: 'Four' }).click()
  // The cursor is on its line, so the line shows its marks; the outline says where it is.
  await expect(lineOf(page, 'Four')).toHaveText('## Four')
  await expect(lineOf(page, 'Four')).toBeInViewport()
  await expect(outline.getByRole('button', { name: 'Four' })).toHaveAttribute(
    'aria-current',
    'location',
  )
})

test('Ctrl F in the editor finds in this note; elsewhere it is the browser’s (FR-109)', async ({
  page,
}) => {
  await registerFreshUser(page)
  await openNote(page, 'A ledger question.\n\nThe ledger on paper.\n\nEnd')
  // Outside the editor the press is not ours.
  await page.getByRole('textbox', { name: 'Title' }).click()
  await page.keyboard.press('ControlOrMeta+f')
  const bar = page.getByRole('search', { name: 'Find in this note' })
  await expect(bar).toHaveCount(0)

  await lineOf(page, 'End').click()
  await page.keyboard.press('ControlOrMeta+f')
  await expect(bar.getByRole('textbox', { name: 'Find' })).toBeFocused()
  await page.keyboard.type('LEDGER')
  // From the cursor on, round the end: the cursor was at the last line.
  await expect(bar).toContainText('1 of 2')
  await expect(page.locator('[data-markdown-editor] .cm-md-found-here')).toHaveText('ledger')
  await page.keyboard.press('Enter')
  await expect(bar).toContainText('2 of 2')
  await page.keyboard.press('Shift+Enter')
  await expect(bar).toContainText('1 of 2')
  await page.keyboard.type('x')
  await expect(bar).toContainText('No matches')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Escape')
  await expect(bar).toHaveCount(0)
  await expect(page.locator('[data-markdown-editor] .cm-md-found')).toHaveCount(0)
  await expect(editor(page)).toBeFocused()
  // Back in the text: its cursor's line shows its marks again.
  await expect(page.locator('[data-markdown-editor] .cm-md-active')).toHaveCount(1)
})

test('a note downloads as a .md file, its text as written (FR-111)', async ({ page }) => {
  await registerFreshUser(page)
  const text = '## Plan\n\n- [ ] Call\n\n$e^{i\\pi}$ 和中文'
  await openNote(page, text)
  await page.getByRole('button', { name: 'More', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Download .md' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('Prep.md')
  const chunks: Buffer[] = []
  for await (const c of (await file.createReadStream())!) chunks.push(c as Buffer)
  expect(Buffer.concat(chunks).toString('utf8')).toBe(text)
})
