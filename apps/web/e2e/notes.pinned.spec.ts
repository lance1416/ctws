import { expect, test } from '@playwright/test'
import { registerFreshUser } from './helpers'

/**
 * A NOTE STARTED FROM ANYWHERE (FR-050, FR-074), on the server pinned at Thursday, October 22,
 * 2026, 00:30 UTC (pinned.ts): N then N opens one, its first words make it, and Notes lists it
 * with the day it was written.
 */
test.use({ timezoneId: 'Europe/London' })

test('N N opens a new note; its first words make it, and Recent lists it with its day', async ({
  page,
}) => {
  await registerFreshUser(page)
  await page.keyboard.press('n')
  await page.keyboard.press('n')
  await expect(page).toHaveURL(/\/notes\/new$/)
  const title = page.getByRole('textbox', { name: 'Title' })
  await expect(title).toBeFocused()

  const made = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/notes',
  )
  await title.pressSequentially('Interview prep', { delay: 20 })
  const note = (await (await made).json()) as { id: string }
  // The address becomes the note's own, and the typing carries on where it was.
  await expect(page).toHaveURL(new RegExp(`/notes/${note.id}$`))
  await expect(title).toBeFocused()
  await title.pressSequentially(' for Acme', { delay: 20 })
  // The rest is saved as it rests.
  const kept = page.waitForResponse(
    (r) =>
      r.request().method() === 'PATCH' &&
      new URL(r.url()).pathname === `/api/v1/notes/${note.id}` &&
      (r.request().postDataJSON() as { body?: string }).body === '- Ask about the first week',
  )
  await page.getByRole('textbox', { name: 'Note' }).fill('- Ask about the first week')
  // Written where it reads: the editor draws the list itself, no preview beside it.
  await expect(page.locator('[data-markdown-editor] .cm-line').first()).toContainText(
    'Ask about the first week',
  )
  expect((await kept).ok()).toBe(true)

  await page
    .getByRole('navigation', { name: 'Modules' })
    .getByRole('link', { name: 'Notes' })
    .click()
  const recent = page.getByRole('main').getByRole('region', { name: 'Recent' })
  const row = recent.locator(`[data-note-row="${note.id}"]`)
  await expect(row).toContainText('Interview prep for Acme')
  // 00:30 UTC on the 22nd is 01:30 in London: the 22nd on the account's calendar.
  await expect(row).toContainText('Oct 22')
  await expect(recent.locator('[data-note-row]')).toHaveCount(1)
})
