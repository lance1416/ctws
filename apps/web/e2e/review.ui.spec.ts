import { expect, test, type Page } from '@playwright/test'
import { registerFreshUser, WEB } from './helpers'

/**
 * 回顾 -- the page that answers "how did the week go".
 *
 * It did not answer it. The three numbers were nowhere on the page, so the only way to know how
 * much got done was to count rows; the date range was plain text with a lone "Last week" button
 * pushed to the far side, two halves of one idea dressed as two unrelated things; and one column
 * of short lists left two thirds of the width empty.
 */

async function seed(page: Page) {
  const made = await page.request.post('/api/v1/projects', {
    headers: WEB,
    data: { name: 'Job hunt' },
  })
  const projectId = ((await made.json()) as { id: string }).id
  for (const [title, status] of [
    ['Rewrite the CV', 'done'],
    ['Apply to Acme', 'done'],
    ['Prep for the interview', 'in_progress'],
    ['Rework the rail', 'cancelled'],
  ]) {
    const t = await page.request.post('/api/v1/tasks', {
      headers: WEB,
      data: { projectId, title, parentId: null },
    })
    await page.request.patch(`/api/v1/tasks/${((await t.json()) as { id: string }).id}`, {
      headers: WEB,
      data: { status },
    })
  }
}

test('the week is summed up before it is listed', async ({ page }) => {
  await registerFreshUser(page)
  await seed(page)
  await page.goto('/tasks/review')

  const banner = page.getByRole('region', { name: 'The week' })
  await expect(banner).toBeVisible()
  // Two finished, one started, one dropped -- read off the banner, not counted off the rows.
  await expect(banner.getByRole('term').filter({ hasText: 'Done' }).locator('..')).toContainText(
    '2',
  )
  await expect(banner).toContainText('Started')
  await expect(banner).toContainText('Dropped')
})

test('the week is one control, and it does not step into a week that has not happened', async ({
  page,
}) => {
  await registerFreshUser(page)
  await seed(page)
  await page.goto('/tasks/review')

  const forward = page.getByRole('button', { name: 'The week after' })
  // Nothing has happened next week, so the only thing this step could show is an empty page.
  await expect(forward).toBeDisabled()

  const shown = page.getByText(/^[A-Z][a-z]{2} \d+ – [A-Z][a-z]{2} \d+$/)
  const thisWeek = await shown.textContent()
  await page.getByRole('button', { name: 'The week before' }).click()
  await expect(shown).not.toHaveText(thisWeek!)
  // And once you have gone back there is a way forward and a way home.
  await expect(forward).toBeEnabled()
  await page.getByRole('button', { name: 'This week', exact: true }).last().click()
  await expect(shown).toHaveText(thisWeek!)
})

test('a line of work carries what happened to each task, by its own mark', async ({ page }) => {
  await registerFreshUser(page)
  await seed(page)
  await page.goto('/tasks/review')

  const block = page.getByRole('region', { name: 'Job hunt' })
  // The three sub-headings with a grey count each are gone: the mark says what happened, which
  // is the same glyph the task wears everywhere else in the app.
  await expect(block.getByRole('img', { name: 'Done' })).toHaveCount(2)
  await expect(block.getByRole('img', { name: 'In progress' })).toHaveCount(1)
  await expect(block.getByRole('img', { name: 'Cancelled' })).toHaveCount(1)
  await expect(block.locator('[data-count]')).toHaveText('4')
})
