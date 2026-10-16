import { expect, test, type Page } from '@playwright/test'
import { addDaysYmd, ymd } from './days'
import { makeProject, makeTask, registerFreshUser, WEB } from './helpers'

/**
 * REVIEW -- the page that answers "how did the week go". It reports what HAPPENED in the week, not
 * what is true now.
 */

const project = (page: Page, name: string) => page.getByRole('region', { name })

/** One line of work with two tasks finished, one started and one dropped, all just now. */
async function seed(page: Page) {
  const projectId = await makeProject(page, 'Job hunt')
  for (const [title, status] of [
    ['Rewrite the CV', 'done'],
    ['Apply to Acme', 'done'],
    ['Prep for the interview', 'in_progress'],
    ['Rework the rail', 'cancelled'],
  ])
    await makeTask(page, projectId, title!, { status })
}

test('the review is a destination, grouped by line of work', async ({ page }) => {
  await registerFreshUser(page)
  const ctws = await makeProject(page, 'CTWS')
  const job = await makeProject(page, '求职')
  await makeTask(page, ctws, '配色重做', { status: 'done' })
  await makeTask(page, ctws, 'Board', { status: 'in_progress' })
  await makeTask(page, ctws, '再开一次会', { status: 'cancelled' })
  await makeTask(page, job, '改简历', { status: 'done' })

  await page.getByRole('link', { name: 'Review' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Review' })).toBeVisible()

  await expect(project(page, 'CTWS')).toContainText('配色重做')
  await expect(project(page, 'CTWS')).toContainText('Board')
  await expect(project(page, 'CTWS')).toContainText('再开一次会')
  // Each line of work is its own block; nothing from one shows up under the other.
  await expect(project(page, '求职')).toContainText('改简历')
  await expect(project(page, '求职')).not.toContainText('配色重做')
})

test('it shows work that was finished and then reopened, which Done does not', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'CTWS')
  const id = await makeTask(page, pid, '写迁移', { status: 'done' })
  await page.request.patch(`/api/v1/tasks/${id}`, { headers: WEB, data: { status: 'todo' } })

  // THE CASE THE VIEW EXISTS FOR. Finishing something on Tuesday is work done even if it came
  // back on Thursday.
  await page.goto('/tasks/review')
  await expect(project(page, 'CTWS')).toContainText('写迁移')

  await page.getByRole('tab', { name: 'Done' }).click()
  await expect(page.getByText('Nothing finished yet')).toBeVisible()
})

test('a week with nothing in it still says which week it was', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/tasks/review')
  await expect(page.getByText('Nothing happened this week')).toBeVisible()
  // The bounds come from the server, which decided them in the account's zone; they are shown
  // even with no rows, so they cannot have been derived from the rows.
  await expect(page.getByText(/[A-Z][a-z]{2} \d+ – [A-Z][a-z]{2} \d+/)).toBeVisible()
})

test('the week is summed up before it is listed', async ({ page }) => {
  await registerFreshUser(page)
  await seed(page)
  await page.goto('/tasks/review')

  // Said as one sentence under the title, the way a project's head says its numbers; read off it,
  // not counted off the rows.
  await expect(page.locator('[data-review-sentence]')).toHaveText(
    '2 done, 1 started and 1 dropped.',
  )
})

const label = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })

test('the week steps back a whole week, and forward and This week come back to this one', async ({
  page,
}) => {
  await registerFreshUser(page)
  await seed(page)
  await page.goto('/tasks/review')

  const forward = page.getByRole('button', { name: 'The week after' })
  const back = page.getByRole('button', { name: 'The week before' })
  const home = page.getByRole('button', { name: 'This week', exact: true })
  // Nothing has happened next week, so the only thing this step could show is an empty page.
  await expect(forward).toBeDisabled()
  await expect(project(page, 'Job hunt')).toContainText('Rewrite the CV')

  // The account takes the browser's zone, which is the runner's, so its Monday is the runner's.
  const today = new Date()
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const thisMonday = ymd(monday)

  await back.click()
  await expect(
    page.getByText(`${label(addDaysYmd(thisMonday, -7))} – ${label(addDaysYmd(thisMonday, -1))}`),
  ).toBeVisible()
  await expect(page.getByText('Nothing happened this week')).toBeVisible()
  await expect(forward).toBeEnabled()

  await forward.click()
  await expect(forward).toBeDisabled()
  await expect(home).toHaveCount(0)
  await expect(project(page, 'Job hunt')).toContainText('Rewrite the CV')

  await back.click()
  await home.last().click()
  await expect(project(page, 'Job hunt')).toContainText('Rewrite the CV')
})

test('a line of work carries what happened to each task, by its own mark', async ({ page }) => {
  await registerFreshUser(page)
  await seed(page)
  await page.goto('/tasks/review')

  const block = project(page, 'Job hunt')
  // The mark says what happened: the same glyph the task wears everywhere else in the app.
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

  const block = project(page, 'Job hunt')
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
