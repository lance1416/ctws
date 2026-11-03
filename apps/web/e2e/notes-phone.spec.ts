import { expect, test, type Page } from '@playwright/test'
import { apiPost, editorText, registerFreshUser, WEB } from './helpers'

/**
 * NOTES ON A PHONE (REQ-002 FR-106 to FR-113, artboard 35): the places as cards, a folder its own
 * list; a note in the one editor, 16/24 so Safari does not zoom, the row over the keyboard, and
 * the outline and the note's actions in one sheet from the top bar.
 */
test.use({ viewport: { width: 393, height: 852 }, hasTouch: true })

async function serverNote(page: Page, id: string) {
  return (await (await page.request.get(`/api/v1/notes/${id}`)).json()) as {
    body: string
    folderId: string | null
    pinnedAt: string | null
  }
}

test('the list is the places as cards; a folder opens to its notes, ‹ Notes back', async ({
  page,
}) => {
  await registerFreshUser(page)
  const job = await apiPost<{ id: string }>(page, '/notes/folders', { name: 'Job hunt prep' })
  const bands = await apiPost<{ id: string }>(page, '/notes', { title: 'Salary bands', body: 'x' })
  await page.request.patch(`/api/v1/notes/${bands.id}`, {
    headers: WEB,
    data: { folderId: job.id },
  })
  await apiPost(page, '/notes', { title: 'Weekend plan', body: 'x' })
  await page.goto('/notes')
  for (const place of ['Folders', 'Not in a folder'])
    await expect(page.getByRole('region', { name: place })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Not in a folder' })).toContainText('Weekend plan')
  await page.getByRole('link', { name: /Job hunt prep/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Job hunt prep' })).toBeVisible()
  await expect(page.locator('[data-note-row]')).toHaveText(['Salary bands'])
  await page.getByRole('link', { name: 'Notes' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Notes' })).toBeVisible()
})

test('folders in folders on a phone: each opens to its own, counted whole; ‹ to the one it is in', async ({
  page,
}) => {
  await registerFreshUser(page)
  type Kept = { id: string }
  const a = await apiPost<Kept>(page, '/notes/folders', { name: 'AAA' })
  const b = await apiPost<Kept>(page, '/notes/folders', { name: 'BBB', parentId: a.id })
  const c = await apiPost<Kept>(page, '/notes/folders', { name: 'CCC', parentId: b.id })
  for (const [title, folderId] of [
    ['In A', a.id],
    ['In B', b.id],
    ['In C', c.id],
  ] as const)
    await apiPost(page, '/notes', { title, body: 'x', folderId })
  await page.goto('/notes')
  const folders = page.getByRole('region', { name: 'Folders' })
  // Only the top level here, each counting every note under it.
  await expect(folders.getByRole('link')).toHaveText([/AAA\s*3/])
  await folders.getByRole('link', { name: /AAA/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'AAA' })).toBeVisible()
  await expect(page.getByRole('link', { name: /BBB\s*2/ })).toBeVisible()
  await expect(page.locator('[data-note-row]')).toHaveText(['In A'])
  await page.getByRole('link', { name: /BBB/ }).click()
  await page.getByRole('link', { name: /CCC\s*1/ }).click()
  await expect(page.locator('[data-note-row]')).toHaveText(['In C'])
  // Its own address opens it too; back is the folder it is in.
  await page.goto(`/notes?folder=${c.id}`)
  await expect(page.getByRole('heading', { level: 1, name: 'CCC' })).toBeVisible()
  await page.getByRole('link', { name: 'BBB' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'BBB' })).toBeVisible()
})

test('a note is the one editor at 16/24, and the row over the keyboard writes its marks', async ({
  page,
}) => {
  await registerFreshUser(page)
  const note = await apiPost<{ id: string }>(page, '/notes', { title: 'Prep', body: 'Plan' })
  await page.goto(`/notes/${note.id}`)
  const editor = page.getByRole('textbox', { name: 'Note' })
  await expect(page.locator('[data-markdown-editor] .cm-content')).toBeVisible()
  // 16 at least, or Safari zooms the page onto the field.
  expect(
    await page
      .locator('[data-markdown-editor] .cm-scroller')
      .evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe('16px')

  const row = page.getByRole('toolbar', { name: 'Formatting' })
  await expect(row).toHaveCount(0)
  await page.locator('[data-markdown-editor] .cm-line').first().click()
  await expect(row).toBeVisible()
  await expect(row.getByRole('button')).toHaveText(['', '', '', '', '', ''])
  await row.getByRole('button', { name: 'Heading' }).click()
  await expect.poll(async () => (await serverNote(page, note.id)).body).toBe('## Plan')
  await row.getByRole('button', { name: 'Task' }).click()
  await expect.poll(async () => (await serverNote(page, note.id)).body).toBe('- [ ] Plan')
  await row.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(async () => (await serverNote(page, note.id)).body).toBe('## Plan')
  // The editor kept the focus all along: the keyboard stays up.
  await expect(page.locator('[data-markdown-editor] .cm-content')).toBeFocused()

  await apiPost(page, '/people', { name: 'Mira Chen' })
  await page.keyboard.press('End')
  await row.getByRole('button', { name: 'Mention' }).click()
  await page.keyboard.type('Mi')
  await expect(page.getByRole('listbox').getByRole('option').first()).toContainText('Mira Chen')
  await expect.poll(() => editorText(editor)).toContain('## Plan @Mi')
})

test('the outline and the note’s actions are one sheet: a heading a tap away, Pin, a folder', async ({
  page,
}) => {
  await registerFreshUser(page)
  const body = `Intro\n\n## One\n\n${'words\n\n'.repeat(20)}## Two\n\nEnd`
  const note = await apiPost<{ id: string }>(page, '/notes', { title: 'Prep', body })
  await page.goto(`/notes/${note.id}`)
  await expect(page.locator('[data-markdown-editor] .cm-content')).toBeVisible()
  await page.getByRole('button', { name: 'Outline' }).click()
  const sheet = page.getByRole('dialog', { name: 'Outline' })
  await sheet.getByRole('button', { name: 'Two' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(page.locator('[data-markdown-editor] .cm-line', { hasText: 'Two' })).toBeInViewport()

  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('dialog', { name: 'Outline' }).getByRole('button', { name: 'Pin' }).click()
  await expect.poll(async () => (await serverNote(page, note.id)).pinnedAt).not.toBeNull()

  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('button', { name: 'Move to a folder…' }).click()
  const folders = page.getByRole('dialog', { name: 'Move to a folder' })
  await folders.getByRole('button', { name: 'New folder…' }).click()
  await folders.getByRole('textbox', { name: 'New folder' }).fill('Job hunt prep')
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await serverNote(page, note.id)).folderId).not.toBeNull()
  await expect(page.getByRole('main').getByRole('button', { name: 'Job hunt prep' })).toBeVisible()
})

test('a tap on the row writes and keeps the editor’s focus, the keyboard up (BUG-101)', async ({
  page,
}) => {
  await registerFreshUser(page)
  const note = await apiPost<{ id: string }>(page, '/notes', { title: 'Prep', body: 'Plan' })
  await page.goto(`/notes/${note.id}`)
  await page.locator('[data-markdown-editor] .cm-line').first().tap()
  const row = page.getByRole('toolbar', { name: 'Formatting' })
  await row.getByRole('button', { name: 'List' }).tap()
  await expect.poll(async () => (await serverNote(page, note.id)).body).toBe('- Plan')
  await expect(page.locator('[data-markdown-editor] .cm-content')).toBeFocused()
  await row.getByRole('button', { name: 'Heading' }).tap()
  await expect.poll(async () => (await serverNote(page, note.id)).body).toBe('## Plan')
  await expect(row).toBeVisible()
})

test('a button pressed while an IME composes waits for the words, then acts (BUG-102)', async ({
  page,
}) => {
  await registerFreshUser(page)
  const note = await apiPost<{ id: string }>(page, '/notes', { title: 'Prep', body: '' })
  await page.goto(`/notes/${note.id}`)
  await page.locator('[data-markdown-editor] .cm-content').tap()
  const cdp = await page.context().newCDPSession(page)
  for (const t of ['l', 'li', 'lia'])
    await cdp.send('Input.imeSetComposition', {
      text: t,
      selectionStart: t.length,
      selectionEnd: t.length,
    })
  await page
    .getByRole('toolbar', { name: 'Formatting' })
    .getByRole('button', { name: 'Link' })
    .tap()
  await cdp.send('Input.insertText', { text: '链接' })
  await expect.poll(async () => (await serverNote(page, note.id)).body).toBe('链接[]()')
})
