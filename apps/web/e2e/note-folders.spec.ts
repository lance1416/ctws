import { expect, test, type Page } from '@playwright/test'
import { apiPost, registerFreshUser, WEB } from './helpers'

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
  await page.getByRole('menuitem', { name: 'Delete…' }).click()
  await expect(row('Empty')).toHaveCount(0)

  await row('Reading notes').hover()
  await page.getByRole('button', { name: 'More for Reading notes' }).click()
  await page.getByRole('menuitem', { name: 'Delete…' }).click()
  const ask = page.getByRole('alertdialog', { name: 'Delete Reading notes' })
  await expect(ask).toContainText(
    'Delete Reading notes? The folder goes; its 1 note stays, one level up.',
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
  const pin = page.getByRole('button', { name: 'Pin', exact: true })
  await expect(pin).toHaveAttribute('aria-pressed', 'false')
  await pin.click()
  await expect(section(page, 'Pinned')).toContainText('Weekend plan')
  await expect(pin).toHaveAttribute('aria-pressed', 'true')
  // Ink while pinned, muted while not: the two read apart.
  const colour = () => pin.evaluate((el) => getComputedStyle(el).color)
  // Off the button, whose hover is ink either way.
  await page.mouse.move(0, 0)
  const pinnedColour = await colour()
  expect((await serverNote(page, note.id)).pinnedAt).not.toBeNull()
  await pin.click()
  await expect(section(page, 'Pinned')).toHaveCount(0)
  await page.mouse.move(0, 0)
  await expect.poll(colour).not.toBe(pinnedColour)

  await page.goto(`/notes/${on.id}`)
  await expect(page.locator('[data-markdown-editor]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pin', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'New folder…' })).toHaveCount(0)
})

// ------------------------------------------------------------------- folders in folders (FR-117)

type KeptFolder = { id: string; parentId: string | null; name: string; open: boolean }

async function serverFolders(page: Page): Promise<KeptFolder[]> {
  const res = await page.request.get('/api/v1/notes/folders')
  return ((await res.json()) as { folders: KeptFolder[] }).folders
}

const folderRow = (page: Page, name: string) =>
  sidebar(page)
    .locator('[data-folder-row]')
    .filter({
      has: page.getByRole('button', { name, exact: true }),
    })

async function folderMenu(page: Page, name: string) {
  await sidebar(page).getByRole('button', { name, exact: true }).hover()
  await page.getByRole('button', { name: `More for ${name}` }).click()
}

async function newFolderIn(page: Page, parent: string, name: string) {
  await folderMenu(page, parent)
  await page.getByRole('menuitem', { name: 'New folder' }).click()
  await page.getByRole('textbox', { name: `New folder in ${parent}` }).fill(name)
  await page.keyboard.press('Enter')
  await expect(sidebar(page).getByRole('button', { name, exact: true })).toBeVisible()
}

test('folders go three deep: a note dragged into the third, no fourth to make', async ({
  page,
}) => {
  await registerFreshUser(page)
  const note = await apiPost<{ id: string }>(page, '/notes', { title: 'Offer letter', body: 'x' })
  await page.goto('/notes')
  await newFolder(page, 'Job hunt prep')
  await newFolderIn(page, 'Job hunt prep', 'Offers')
  await newFolderIn(page, 'Offers', 'London')
  // The third has no New folder; the first two did.
  await folderMenu(page, 'London')
  await expect(page.getByRole('menuitem', { name: 'New note' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'New folder' })).toHaveCount(0)
  await page.keyboard.press('Escape')

  const row = sidebar(page).locator(`[data-note-row="${note.id}"]`)
  await row.dragTo(sidebar(page).getByRole('button', { name: 'London', exact: true }), {
    steps: 8,
  })
  const london = (await serverFolders(page)).find((f) => f.name === 'London')!
  await expect
    .poll(async () => (await page.request.get(`/api/v1/notes/${note.id}`)).json())
    .toMatchObject({ folderId: london.id })
  // Every folder over it counts it.
  await expect(folderRow(page, 'Job hunt prep').locator('[data-count]').first()).toHaveText('1')
})

test('a folder dragged under itself is not taken, and says why', async ({ page }) => {
  await registerFreshUser(page)
  const a = await apiPost<KeptFolder>(page, '/notes/folders', { name: 'A' })
  const b = await apiPost<KeptFolder>(page, '/notes/folders', { name: 'B', parentId: a.id })
  await page.request.patch(`/api/v1/notes/folders/${a.id}`, { headers: WEB, data: { open: true } })
  await page.goto('/notes')
  const target = sidebar(page).getByRole('button', { name: 'B', exact: true })
  await expect(target).toBeVisible()
  const from = (await sidebar(page).getByRole('button', { name: 'A', exact: true }).boundingBox())!
  const to = (await target.boundingBox())!
  await page.mouse.move(from.x + 40, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + 40, to.y + to.height / 2, { steps: 10 })
  await expect(page.getByRole('status').filter({ hasText: 'Folders go three deep' })).toBeVisible()
  await page.mouse.up()
  expect((await serverFolders(page)).find((f) => f.id === a.id)?.parentId).toBeNull()
  expect((await serverFolders(page)).find((f) => f.id === b.id)?.parentId).toBe(a.id)
})

test('a folder deleted leaves what it held one level up, a name taken numbered', async ({
  page,
}) => {
  await registerFreshUser(page)
  const job = await apiPost<KeptFolder>(page, '/notes/folders', { name: 'Job hunt prep' })
  const offers = await apiPost<KeptFolder>(page, '/notes/folders', {
    name: 'Offers',
    parentId: job.id,
  })
  await apiPost(page, '/notes/folders', { name: 'Talks', parentId: job.id })
  await apiPost(page, '/notes/folders', { name: 'Talks', parentId: offers.id })
  const n = await apiPost<{ id: string }>(page, '/notes', { title: 'Offer letter', body: 'x' })
  await page.request.patch(`/api/v1/notes/${n.id}`, {
    headers: WEB,
    data: { folderId: offers.id },
  })
  await page.request.patch(`/api/v1/notes/folders/${job.id}`, {
    headers: WEB,
    data: { open: true },
  })
  await page.goto('/notes')
  await folderMenu(page, 'Offers')
  await page.getByRole('menuitem', { name: 'Delete…' }).click()
  const ask = page.getByRole('alertdialog', { name: 'Delete Offers' })
  await expect(ask).toContainText(
    'Delete Offers? The folder goes; its 1 folder and 1 note stay, one level up. Talks becomes Talks 2.',
  )
  await ask.getByRole('button', { name: 'Delete Offers' }).click()
  await expect(sidebar(page).getByRole('button', { name: 'Talks 2', exact: true })).toBeVisible()
  const now = await serverFolders(page)
  expect(now.find((f) => f.name === 'Talks 2')?.parentId).toBe(job.id)
  expect(
    ((await (await page.request.get(`/api/v1/notes/${n.id}`)).json()) as { folderId: string })
      .folderId,
  ).toBe(job.id)
})

test('each folder stays open or closed as it was left, and opens over the note shown', async ({
  page,
}) => {
  await registerFreshUser(page)
  const a = await apiPost<KeptFolder>(page, '/notes/folders', { name: 'A' })
  const b = await apiPost<KeptFolder>(page, '/notes/folders', { name: 'B', parentId: a.id })
  const n = await apiPost<{ id: string }>(page, '/notes', { title: 'Deep', body: 'x' })
  await page.request.patch(`/api/v1/notes/${n.id}`, { headers: WEB, data: { folderId: b.id } })
  // Shown, the chain over it opens itself.
  await page.goto(`/notes/${n.id}`)
  await expect(sidebar(page).locator(`[data-note-row="${n.id}"]`)).toBeVisible()
  // Opened by hand, it stays open on the next visit; closed, it stays closed.
  await page.goto('/notes')
  const toggle = sidebar(page).getByRole('button', { name: 'A', exact: true })
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
  await expect
    .poll(async () => (await serverFolders(page)).find((f) => f.id === a.id)?.open)
    .toBe(true)
  await page.reload()
  await expect(sidebar(page).getByRole('button', { name: 'A', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  await sidebar(page).getByRole('button', { name: 'A', exact: true }).click()
  await expect
    .poll(async () => (await serverFolders(page)).find((f) => f.id === a.id)?.open)
    .toBe(false)
})

test('Move to a folder… keeps No folder and New folder… in sight, the folders between scrolling', async ({
  page,
}) => {
  await registerFreshUser(page)
  for (let i = 1; i <= 14; i++) await apiPost(page, '/notes/folders', { name: `Folder ${i}` })
  await apiPost(page, '/notes', { title: 'What I know', body: 'x' })
  await page.goto('/notes')
  await sidebar(page).getByText('What I know', { exact: true }).hover()
  await page.getByRole('button', { name: 'More for What I know' }).click()
  const move = page.getByRole('menuitem', { name: 'Move to a folder…' })
  await move.hover()
  const none = page.getByRole('menuitemradio', { name: 'No folder' })
  const make = page.getByRole('menuitem', { name: 'New folder…' })
  await expect(none).toBeInViewport()
  await expect(make).toBeInViewport()
  await expect(
    page.getByRole('menuitemradio', { name: 'Folder 9', exact: true }),
  ).not.toBeInViewport()
  // Opened by the pointer, the row it opened from wears the hover ground, not the keys' ring.
  const outline = (el: Element) => getComputedStyle(el).outlineStyle
  expect(await move.evaluate(outline)).toBe('none')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowDown')
  const next = page.getByRole('menuitem', { name: 'Download as .md' })
  await expect(next).toBeFocused()
  await expect.poll(() => next.evaluate(outline)).toBe('solid')
})
