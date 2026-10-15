import { expect, test, type Page } from '@playwright/test'
import { addDaysYmd, ymd } from './days'
import { registerFreshUser, WEB } from './helpers'

/**
 * REVIEW -- the page that answers "how did the week go".
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

  // Two finished, one started, one dropped -- said as one sentence under the title, the way a
  // project's head says its numbers, not as a row of tiles; read off it, not counted off the rows.
  await expect(page.locator('[data-review-sentence]')).toHaveText(
    '2 done, 1 started and 1 dropped.',
  )
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

/**
 * A REVIEW ROW IS THE APP'S ROW: the day it happened in the margin, the project's thread, then the
 * mark and the title. Each line of work is a section headed where the threads hang, as the page's
 * title is -- one column, like every other list in the app.
 */
test('the week hangs on the margin: the day, the thread, then what happened', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await registerFreshUser(page)
  await seed(page)
  await page.goto('/tasks/review')

  const block = page.getByRole('region', { name: 'Job hunt' })
  // Everything in the seed happened just now, so its day is today.
  await expect(block.locator('[data-row-lead-text]').first()).toHaveText('Today')
  const threads = await page
    .locator('[data-review-row] [data-thread]')
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().x)))
  expect(threads).toHaveLength(4)
  expect(new Set(threads).size).toBe(1)
  const h1 = (await page.getByRole('heading', { level: 1, name: 'Review' }).boundingBox())!
  expect(Math.round(h1.x)).toBe(threads[0])
  const head = (await page.getByRole('heading', { level: 2, name: 'Job hunt' }).boundingBox())!
  expect(Math.round(head.x)).toBe(threads[0])
})

const label = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })

test('the week before is a whole week, and forward comes back to this one', async ({ page }) => {
  // The account takes the browser's zone, which is the runner's, so its Monday is the runner's.
  await registerFreshUser(page, '/tasks/review')
  const today = new Date()
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const thisMonday = ymd(monday)
  await page.getByRole('button', { name: 'The week before' }).click()
  await expect(
    page.getByText(`${label(addDaysYmd(thisMonday, -7))} – ${label(addDaysYmd(thisMonday, -1))}`),
  ).toBeVisible()
  await page.getByRole('button', { name: 'The week after' }).click()
  await expect(page.getByRole('button', { name: 'The week after' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'This week' })).toHaveCount(0)
})
