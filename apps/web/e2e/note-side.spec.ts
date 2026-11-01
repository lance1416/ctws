import { expect, test, type Page } from '@playwright/test'
import { apiPost, registerFreshUser } from './helpers'

/**
 * NOTES MANAGED FROM THE SIDEBAR (REQ-002 FR-114, FR-115, artboard 38): a note's row has the
 * page's "…" (Rename in place, Pin, Move to a folder…, Download, Delete…), on hover and on a right
 * press; a folder makes a note inside itself. What is kept is read on the server.
 */

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Notes' })
const row = (page: Page, title: string) =>
  sidebar(page).locator('[data-note-row]').filter({ hasText: title })

type Kept = { id: string; title: string | null; folderId: string | null; pinnedAt: string | null }

async function kept(page: Page): Promise<Kept[]> {
  const res = await page.request.get('/api/v1/notes')
  const all = (await res.json()) as Kept[] | { notes: Kept[] }
  return Array.isArray(all) ? all : all.notes
}

async function menuOf(page: Page, title: string) {
  await row(page, title).hover()
  await page.getByRole('button', { name: `More for ${title}` }).click()
}

test('a note’s row is renamed in place: Enter keeps it, Esc and an empty name do not', async ({
  page,
}) => {
  await registerFreshUser(page)
  const note = await apiPost<{ id: string }>(page, '/notes', { title: 'Stripe', body: 'x' })
  await page.goto(`/notes/${note.id}`)
  await menuOf(page, 'Stripe')
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  const field = page.getByRole('textbox', { name: 'Rename Stripe' })
  await field.fill('Stripe: what I know')
  await page.keyboard.press('Enter')
  await expect(row(page, 'Stripe: what I know')).toBeVisible()
  // The page's title takes it too.
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Stripe: what I know')
  await expect.poll(async () => (await kept(page))[0]?.title).toBe('Stripe: what I know')

  // Esc puts the old one back; emptied, it is not kept.
  await menuOf(page, 'Stripe: what I know')
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  await page.getByRole('textbox', { name: /^Rename/ }).fill('Gone')
  await page.keyboard.press('Escape')
  await expect(row(page, 'Stripe: what I know')).toBeVisible()
  await row(page, 'Stripe: what I know').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  await page.getByRole('textbox', { name: /^Rename/ }).fill('')
  await page.keyboard.press('Enter')
  await expect(row(page, 'Stripe: what I know')).toBeVisible()
  expect((await kept(page))[0]?.title).toBe('Stripe: what I know')
})

test('a note’s row pins it and moves it to a folder; one on a thing has neither', async ({
  page,
}) => {
  await registerFreshUser(page)
  await apiPost(page, '/notes/folders', { name: 'Reading notes' })
  const own = await apiPost<{ id: string }>(page, '/notes', { title: 'Shape Up', body: 'x' })
  const mira = await apiPost<{ id: string }>(page, '/people', { name: 'Mira Chen' })
  await apiPost(page, '/notes', { body: 'Likes ledgers', anchor: { type: 'person', id: mira.id } })
  await page.goto(`/notes/${own.id}`)

  await menuOf(page, 'Shape Up')
  await page.getByRole('menuitem', { name: 'Pin' }).click()
  await expect(sidebar(page).getByRole('region', { name: 'Pinned' })).toContainText('Shape Up')
  await menuOf(page, 'Shape Up')
  await page.getByRole('menuitem', { name: 'Move to a folder…' }).click()
  await page.getByRole('menuitemradio', { name: 'Reading notes' }).click()
  await expect
    .poll(async () => (await kept(page)).find((n) => n.id === own.id)?.folderId)
    .not.toBeNull()

  await menuOf(page, 'Likes ledgers')
  await expect(page.getByRole('menuitem', { name: 'Download as .md' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Pin' })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: 'Move to a folder…' })).toHaveCount(0)
})

test('Delete… from a note’s row asks once, then shows the next note in the list', async ({
  page,
}) => {
  await registerFreshUser(page)
  const first = await apiPost<{ id: string }>(page, '/notes', { title: 'Alpha', body: 'x' })
  const second = await apiPost<{ id: string }>(page, '/notes', { title: 'Beta', body: 'x' })
  await page.goto(`/notes/${second.id}`)
  // The list is newest first: Beta, then Alpha.
  await menuOf(page, 'Beta')
  await page.getByRole('menuitem', { name: 'Delete…' }).click()
  const ask = page.getByRole('alertdialog', { name: 'Delete Beta' })
  await expect(ask).toContainText(
    'Delete Beta? The note goes, with everything written in it. The people and things it mentions stay.',
  )
  await ask.getByRole('button', { name: 'Delete Beta' }).click()
  await expect(page).toHaveURL(new RegExp(`/notes/${first.id}$`))
  await expect(row(page, 'Beta')).toHaveCount(0)
  expect((await kept(page)).map((n) => n.title)).toEqual(['Alpha'])
})

test('a folder’s + makes a note in it: Untitled at its top, the title focused', async ({
  page,
}) => {
  await registerFreshUser(page)
  const reading = await apiPost<{ id: string }>(page, '/notes/folders', { name: 'Reading notes' })
  await apiPost(page, '/notes', { title: 'Elsewhere', body: 'x' })
  await page.goto('/notes')
  const folder = sidebar(page).locator(`[data-folder-row="${reading.id}"]`)
  await folder.hover()
  await page.getByRole('button', { name: 'New note in Reading notes' }).click()
  await expect(page).toHaveURL(/\/notes\/new\?folder=/)
  await expect(folder).toContainText('Untitled')
  await expect(page.getByRole('textbox', { name: 'Title' })).toBeFocused()
  await page.keyboard.type('Thinking in Systems')
  await expect
    .poll(async () => (await kept(page)).find((n) => n.title === 'Thinking in Systems')?.folderId)
    .toBe(reading.id)
  await expect(folder).toContainText('Thinking in Systems')
})

test('a note made in a folder and left empty is not kept', async ({ page }) => {
  await registerFreshUser(page)
  const reading = await apiPost<{ id: string }>(page, '/notes/folders', { name: 'Reading notes' })
  await page.goto(`/notes/new?folder=${reading.id}`)
  await expect(page.getByRole('textbox', { name: 'Title' })).toBeFocused()
  await page.goto('/notes')
  await expect(sidebar(page)).not.toContainText('Untitled')
  expect(await kept(page)).toEqual([])
})

test('N N on a note in a folder makes the new note in that folder too', async ({ page }) => {
  await registerFreshUser(page)
  const reading = await apiPost<{ id: string }>(page, '/notes/folders', { name: 'Reading notes' })
  const inside = await apiPost<{ id: string }>(page, '/notes', { title: 'Shape Up', body: 'x' })
  await page.request.patch(`/api/v1/notes/${inside.id}`, {
    headers: { 'x-ctws-client': 'web' },
    data: { folderId: reading.id },
  })
  await page.goto(`/notes/${inside.id}`)
  await expect(page.locator('[data-markdown-editor] .cm-content')).toBeFocused()
  // Nothing being typed in: the editor lets go of the focus.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('n')
  await page.keyboard.press('n')
  await expect(page).toHaveURL(new RegExp(`/notes/new\\?folder=${reading.id}$`))
  await page.keyboard.type('Second in the folder')
  await expect
    .poll(async () => (await kept(page)).find((n) => n.title === 'Second in the folder')?.folderId)
    .toBe(reading.id)
})
