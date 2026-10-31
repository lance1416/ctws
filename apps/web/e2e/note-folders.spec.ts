import { expect, test, type Page } from '@playwright/test'
import { apiPost, registerFreshUser } from './helpers'

/**
 * FOLDERS AND PINS (REQ-002 FR-110, artboard 34, DES-001 "文件夹和置顶"): a note on its own goes
 * in one folder, by its "…" or by a drag, and may be pinned; folders are made, renamed and
 * deleted in the sidebar, a deleted folder's notes left in none. Where a note is kept is read on
 * the server, not only on screen.
 */

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Notes' })
const section = (page: Page, name: string) => sidebar(page).getByRole('region', { name })

async function serverNote(page: Page, id: string) {
  const res = await page.request.get(`/api/v1/notes/${id}`)
  return (await res.json()) as { folderId: string | null; pinnedAt: string | null }
}

async function newFolder(page: Page, name: string) {
  await section(page, 'Folders').getByRole('button', { name: 'New folder' }).click()
  await page.getByRole('textbox', { name: 'New folder' }).fill(name)
  await page.keyboard.press('Enter')
  await expect(sidebar(page).getByRole('button', { name, exact: true })).toBeVisible()
}

test('a folder made in the sidebar takes a note by its "…", and its tag shows it there', async ({
  page,
}) => {
  await registerFreshUser(page)
  const note = await apiPost<{ id: string }>(page, '/notes', { title: 'Shape Up', body: 'x' })
  await page.goto(`/notes/${note.id}`)
  await newFolder(page, 'Reading notes')
  // A name is a folder's own.
  await section(page, 'Folders').getByRole('button', { name: 'New folder' }).click()
  await page.getByRole('textbox', { name: 'New folder' }).fill('Reading notes')
  await page.keyboard.press('Enter')
  await expect(section(page, 'Folders').getByRole('alert')).toContainText('already a folder')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'More', exact: true }).click()
  await page.getByRole('menuitemradio', { name: 'Reading notes' }).click()
  await expect.poll(async () => (await serverNote(page, note.id)).folderId).not.toBeNull()
  const folder = sidebar(page).locator('[data-folder-row]').filter({ hasText: 'Reading notes' })
  await expect(folder).toContainText('Shape Up')
  await expect(section(page, 'Not in a folder')).toHaveCount(0)

  // Closed, the head's tag opens it again to the note.
  await folder.getByRole('button', { name: 'Reading notes' }).click()
  await expect(folder.locator('[data-note-row]')).toHaveCount(0)
  await page.getByRole('main').getByRole('button', { name: 'Reading notes' }).click()
  await expect(folder.locator(`[data-note-row="${note.id}"]`)).toBeVisible()
})

test('New folder… in a note’s "…" makes the folder and puts the note in it', async ({ page }) => {
  await registerFreshUser(page)
  const note = await apiPost<{ id: string }>(page, '/notes', { title: 'Salary bands', body: 'x' })
  await page.goto(`/notes/${note.id}`)
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await page.getByRole('menuitem', { name: 'New folder…' }).click()
  await page.getByRole('textbox', { name: 'New folder' }).fill('Job hunt prep')
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await serverNote(page, note.id)).folderId).not.toBeNull()
  await expect(
    sidebar(page).locator('[data-folder-row]').filter({ hasText: 'Job hunt prep' }),
  ).toContainText('Salary bands')
})

test('a note is dragged into a folder, and out of it onto Not in a folder', async ({ page }) => {
  await registerFreshUser(page)
  const note = await apiPost<{ id: string }>(page, '/notes', { title: 'Gift ideas', body: 'x' })
  await apiPost(page, '/notes', { title: 'Weekend plan', body: 'x' })
  await apiPost(page, '/notes/folders', { name: 'Ideas' })
  await page.goto('/notes')
  const row = sidebar(page).locator(`[data-note-row="${note.id}"]`)
  const folder = sidebar(page).locator('[data-folder-row]').filter({ hasText: 'Ideas' })
  await row.dragTo(folder.getByRole('button', { name: 'Ideas' }), { steps: 8 })
  await expect.poll(async () => (await serverNote(page, note.id)).folderId).not.toBeNull()
  await expect(folder.locator(`[data-note-row="${note.id}"]`)).toBeVisible()

  await row.dragTo(section(page, 'Not in a folder').getByRole('heading'), { steps: 8 })
  await expect.poll(async () => (await serverNote(page, note.id)).folderId).toBeNull()
})

test('renamed in its row; deleted, asked first, its notes left in none', async ({ page }) => {
  await registerFreshUser(page)
  const folder = await apiPost<{ id: string }>(page, '/notes/folders', { name: 'Readng' })
  const note = await apiPost<{ id: string }>(page, '/notes', { title: 'Shape Up', body: 'x' })
  await page.request.patch(`/api/v1/notes/${note.id}`, {
    headers: { 'x-ctws-client': 'web' },
    data: { folderId: folder.id },
  })
  await apiPost(page, '/notes/folders', { name: 'Empty' })
  await page.goto('/notes')
  const row = (name: string) => sidebar(page).locator('[data-folder-row]').filter({ hasText: name })

  await row('Readng').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  await page.getByRole('textbox', { name: 'Rename Readng' }).fill('Reading notes')
  await page.keyboard.press('Enter')
  await expect(row('Reading notes')).toBeVisible()

  // An empty one goes at once.
  await row('Empty').hover()
  await page.getByRole('button', { name: 'More for Empty' }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await expect(row('Empty')).toHaveCount(0)

  await row('Reading notes').hover()
  await page.getByRole('button', { name: 'More for Reading notes' }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  const ask = page.getByRole('alertdialog', { name: 'Delete Reading notes' })
  await expect(ask).toContainText(
    'Delete Reading notes? The folder goes; its note stays, in Not in a folder.',
  )
  await ask.getByRole('button', { name: 'Delete Reading notes' }).click()
  await expect(row('Reading notes')).toHaveCount(0)
  await expect(section(page, 'On their own')).toContainText('Shape Up')
  expect((await serverNote(page, note.id)).folderId).toBeNull()
})

test('a pinned note is listed first, under Pinned, and a note on a thing has no pin', async ({
  page,
}) => {
  await registerFreshUser(page)
  const note = await apiPost<{ id: string }>(page, '/notes', { title: 'Weekend plan', body: 'x' })
  const mira = await apiPost<{ id: string }>(page, '/people', {
    givenName: 'Mira',
    familyName: 'Chen',
  })
  const on = await apiPost<{ id: string }>(page, '/notes', {
    body: 'Likes ledgers',
    anchor: { type: 'person', id: mira.id },
  })
  await page.goto(`/notes/${note.id}`)
  await page.getByRole('button', { name: 'Pin', exact: true }).click()
  await expect(section(page, 'Pinned')).toContainText('Weekend plan')
  expect((await serverNote(page, note.id)).pinnedAt).not.toBeNull()
  await page.getByRole('button', { name: 'Unpin' }).click()
  await expect(section(page, 'Pinned')).toHaveCount(0)

  await page.goto(`/notes/${on.id}`)
  await expect(page.locator('[data-markdown-editor]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pin', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'New folder…' })).toHaveCount(0)
})
