import { expect, test, type Locator, type Page } from '@playwright/test'
import { apiPost, registerFreshUser } from './helpers'

/**
 * .md files made notes: unchanged, named by the file, into a folder or none; picked from the
 * Notes page or a folder's menu, or dropped on the sidebar. Kept is read on the server.
 */

type Kept = { id: string; title: string | null; body: string; folderId: string | null }

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Notes' })
/** The line said at the foot; the drag library keeps a live region of its own, empty. */
const toast = (page: Page) => page.getByRole('status').filter({ hasText: /./ })
const file = (name: string, text: string | Uint8Array) => ({
  name,
  mimeType: 'text/markdown',
  buffer: typeof text === 'string' ? Buffer.from(text, 'utf8') : Buffer.from(text),
})

async function kept(page: Page): Promise<Kept[]> {
  const res = await page.request.get('/api/v1/notes')
  return ((await res.json()) as { notes: Kept[] }).notes
}

/** Drops files from the desktop on an element, as a browser fires it. */
async function dropFiles(target: Locator, files: { name: string; text: string }[]) {
  const transfer = await target.page().evaluateHandle((list) => {
    const dt = new DataTransfer()
    for (const f of list) dt.items.add(new File([f.text], f.name))
    return dt
  }, files)
  await target.dispatchEvent('dragenter', { dataTransfer: transfer })
  await target.dispatchEvent('dragover', { dataTransfer: transfer })
  await target.dispatchEvent('drop', { dataTransfer: transfer })
}

test('one file from the Notes page comes in unchanged, named by its file, and opens', async ({
  page,
}) => {
  await registerFreshUser(page)
  await apiPost(page, '/notes', { title: 'Already here', body: 'x' })
  await page.goto('/notes')
  const body = '# Ideas\r\n\r\n- one\n- [ ] two\n'
  await page.getByLabel('Import .md files').setInputFiles([file('Ideas.md', body)])
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/)
  const note = (await kept(page)).find((n) => n.title === 'Ideas')!
  expect(note.body).toBe(body)
  expect(note.folderId).toBeNull()
})

test('several into a folder from its menu stay where they were and say how many', async ({
  page,
}) => {
  await registerFreshUser(page)
  const folder = await apiPost<{ id: string }>(page, '/notes/folders', { name: 'Reading notes' })
  await page.goto('/notes')
  await sidebar(page).getByRole('button', { name: 'Reading notes', exact: true }).hover()
  await page.getByRole('button', { name: 'More for Reading notes' }).click()
  await expect(page.getByRole('menuitem', { name: 'Import .md…' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page
    .getByLabel('Import .md files into Reading notes')
    .setInputFiles([file('Shape Up.md', 'a'), file('Deep Work.markdown', 'b')])
  await expect(toast(page)).toHaveText('2 notes imported into Reading notes')
  await expect(page).toHaveURL(/\/notes$/)
  const titles = (await kept(page)).filter((n) => n.folderId === folder.id).map((n) => n.title)
  expect(titles.sort()).toEqual(['Deep Work', 'Shape Up'])
})

test('those that cannot come in are listed with why, and the rest come in anyway', async ({
  page,
}) => {
  await registerFreshUser(page)
  await apiPost(page, '/notes', { title: 'Already here', body: 'x' })
  await page.goto('/notes')
  await page
    .getByLabel('Import .md files')
    .setInputFiles([
      file('Fine.md', 'fine'),
      file('Latin.md', new Uint8Array([0x63, 0x61, 0x66, 0xe9])),
      file('Long.md', 'a'.repeat(100_001)),
    ])
  const said = toast(page)
  await expect(said).toContainText('1 note imported into Not in a folder')
  await expect(said).toContainText(
    "Latin.md isn't UTF-8 text. Save it as UTF-8 and import it again.",
  )
  await expect(said).toContainText('Long.md is longer than a note can hold (100,000 characters).')
  // There is more to read than a few seconds allow: it stays until closed.
  await page.waitForTimeout(4500)
  await expect(said).toBeVisible()
  await said.getByRole('button', { name: 'Close' }).click()
  await expect(said).toHaveCount(0)
  expect((await kept(page)).map((n) => n.title).sort()).toEqual(['Already here', 'Fine'])
})

test('dropped on a folder they go in it; dropped elsewhere in the sidebar, in none', async ({
  page,
}) => {
  await registerFreshUser(page)
  const folder = await apiPost<{ id: string }>(page, '/notes/folders', { name: 'Ideas' })
  await apiPost(page, '/notes', { title: 'Already here', body: 'x' })
  await page.goto('/notes')
  const row = sidebar(page).locator(`[data-folder-row="${folder.id}"] > div`).first()
  await dropFiles(row, [{ name: 'Garden.md', text: 'g' }])
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/)
  await dropFiles(sidebar(page).getByRole('heading', { name: 'Folders' }), [
    { name: 'Trip.md', text: 't' },
    { name: 'Photo.png', text: 'p' },
  ])
  const said = toast(page)
  await expect(said).toContainText('1 note imported into Not in a folder')
  await expect(said).toContainText("Photo.png isn't a .md file.")
  const notes = await kept(page)
  expect(notes.find((n) => n.title === 'Garden')?.folderId).toBe(folder.id)
  expect(notes.find((n) => n.title === 'Trip')?.folderId).toBeNull()
})

test('files with no .md among them come to nothing, and say so', async ({ page }) => {
  await registerFreshUser(page)
  await apiPost(page, '/notes', { title: 'Already here', body: 'x' })
  await page.goto('/notes')
  await dropFiles(page.getByRole('heading', { level: 1, name: 'Notes' }), [
    { name: 'Photo.png', text: 'p' },
  ])
  await expect(toast(page)).toHaveText('Only .md files')
  expect(await kept(page)).toHaveLength(1)
})

test('with no notes yet, Import is beside New note', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/notes')
  await expect(page.getByRole('heading', { name: 'No notes yet' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Import' })).toBeVisible()
  await page.getByLabel('Import .md files').setInputFiles([file('First.md', 'hello')])
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/)
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 393, height: 852 }, hasTouch: true })
  test('there is no way to import', async ({ page }) => {
    await registerFreshUser(page)
    await apiPost(page, '/notes', { title: 'Already here', body: 'x' })
    await page.goto('/notes')
    await expect(page.getByRole('heading', { level: 1, name: 'Notes' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Import' })).toHaveCount(0)
    await expect(page.locator('input[type="file"]')).toHaveCount(0)
  })
})
