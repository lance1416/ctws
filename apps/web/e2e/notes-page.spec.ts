import { expect, test, type Page } from '@playwright/test'
import { apiPost, registerFreshUser, WEB } from './helpers'
import { dayOffset } from './days'

/**
 * NOTES, A KIND OF ITS OWN (FR-050, FR-074): the overview's Recent, a note's page and what it
 * hangs on. What a note's day says is in notes.pinned.spec.ts; what its Markdown renders is in
 * notes.spec.ts.
 */

const recent = (page: Page) => page.getByRole('main').getByRole('region', { name: 'Recent' })
const rows = (page: Page) => recent(page).locator('[data-note-row]')
const row = (page: Page, id: string) => recent(page).locator(`[data-note-row="${id}"]`)

test('a note hung on a meeting says it is on the meeting, and is that meeting’s notes', async ({
  page,
}) => {
  await registerFreshUser(page)
  const m = await apiPost<{ meetingId: string; recurrenceId: string }>(page, '/meetings', {
    title: 'Weekly sync',
    startsLocal: `${dayOffset(1)}T18:00`,
    timeZone: 'America/Toronto',
    durationMinutes: 60,
  })
  const note = await apiPost(page, '/notes', {
    body: 'Ship the importer by Friday.',
    anchor: { type: 'meeting', id: m.meetingId, occurrenceId: m.recurrenceId },
  })
  await page.goto('/notes')

  // Its row: the first line for a note with no title, and what it hangs on.
  const hung = row(page, note.id)
  await expect(hung).toContainText('Ship the importer by Friday.')
  await expect(hung).toContainText('Weekly sync')
  await hung.click()
  await expect(page).toHaveURL(new RegExp(`/notes/${note.id}$`))
  const main = page.getByRole('main')
  await expect(main).toContainText(/On\s*Weekly sync/)
  await expect(main.getByRole('textbox', { name: 'Note' })).toHaveValue(
    'Ship the importer by Friday.',
  )

  // The line is the way to the occurrence it was written for, where it is the notes.
  await main.getByRole('link', { name: 'Weekly sync' }).click()
  await expect(page).toHaveURL(new RegExp(`/meetings/${m.meetingId}\\?`))
  await expect(main.getByRole('heading', { level: 1 })).toHaveText('Weekly sync')
  await expect(main.locator('[data-note-body]')).toContainText('Ship the importer by Friday.')
})

test('a note deleted from its page is gone from Recent, and the rest stay', async ({ page }) => {
  await registerFreshUser(page)
  await apiPost(page, '/notes', { title: 'Keep me', body: 'Still here.' })
  const doomed = await apiPost(page, '/notes', { title: 'Delete me', body: 'Not for long.' })
  await page.goto('/notes')
  await expect(rows(page)).toHaveCount(2)

  await row(page, doomed.id).click()
  await page.getByRole('button', { name: 'Delete this note' }).click()
  const ask = page.getByRole('alertdialog', { name: 'Delete this note' })
  await expect(ask).toContainText('Delete “Delete me”?')
  await ask.getByRole('button', { name: 'Delete this note' }).click()

  await expect(page).toHaveURL(/\/notes$/)
  await expect(rows(page)).toHaveCount(1)
  await expect(recent(page)).toContainText('Keep me')
  await expect(recent(page)).not.toContainText('Delete me')
})

test('the last words typed are kept when the note is left before they rest', async ({ page }) => {
  // The note saves as the typing rests; leaving sooner must not lose what was typed last.
  await registerFreshUser(page)
  const note = await apiPost(page, '/notes', { title: 'Interview prep', body: 'First words' })
  await page.goto(`/notes/${note.id}`)
  await page.getByRole('textbox', { name: 'Note' }).fill('First words, and the last ones')
  await page
    .getByRole('navigation', { name: 'Modules' })
    .getByRole('link', { name: 'Notes' })
    .click()
  await expect(page).toHaveURL(/\/notes$/)
  await expect
    .poll(async () => {
      const res = await page.request.get(`/api/v1/notes/${note.id}`, { headers: WEB })
      return ((await res.json()) as { body: string }).body
    })
    .toBe('First words, and the last ones')
})

test('New note on the overview opens an empty note', async ({ page }) => {
  await registerFreshUser(page)
  await apiPost(page, '/notes', { title: 'Something already there', body: 'x' })
  await page.goto('/notes')
  await expect(page.getByRole('heading', { level: 1, name: 'Notes' })).toBeVisible()
  await page.getByRole('main').getByRole('link', { name: 'New note' }).click()
  await expect(page).toHaveURL(/\/notes\/new$/)
  await expect(page.getByRole('textbox', { name: 'Title' })).toBeFocused()
  await expect(page.getByRole('textbox', { name: 'Note' })).toHaveValue('')
})

test('an empty Notes is the module empty state, whose button starts a note', async ({ page }) => {
  await registerFreshUser(page, '/notes')
  await expect(page.getByRole('heading', { level: 2, name: 'No notes yet' })).toBeVisible()
  await page
    .getByRole('main')
    .getByRole('button', { name: /^New note/ })
    .click()
  await expect(page).toHaveURL(/\/notes\/new$/)
  await expect(page.getByRole('textbox', { name: 'Title' })).toBeFocused()
})
