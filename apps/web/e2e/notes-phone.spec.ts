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
