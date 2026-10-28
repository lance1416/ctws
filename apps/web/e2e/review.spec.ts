import { expect, test, type Page } from '@playwright/test'
import { makeProject, makeTask, registerFreshUser, WEB } from './helpers'

/**
 * REVIEW -- the page that answers "how did the week go" (FR-081). It reports what HAPPENED in the
 * week, read from the change log, not what is true now. The week of artboard 19 itself, on a
 * pinned clock, is `review.pinned.spec.ts`.
 */

/** Review opens on last week; what the seeds did happened this week, so far. */
const thisWeek = async (page: Page) => {
  await page
    .getByRole('navigation', { name: 'Weeks' })
    .getByRole('button', { name: /so far/ })
    .click()
  await expect(page.locator('[data-review-total]')).toContainText(/finished\s*so far/)
}

const lane = (page: Page, name: string) => page.locator(`[data-review-lane="${name}"]`)
const cell = (page: Page, name: string, list: string) =>
  lane(page, name).locator(`[data-review-cell="${list}"]`)

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
  return projectId
}

test('the review is a destination: each line of work a row, split by what happened', async ({
  page,
}) => {
  await registerFreshUser(page)
  await seed(page)
  await makeProject(page, 'Quiet')

  await page
    .getByRole('navigation', { name: 'Modules' })
    .getByRole('link', { name: 'Review' })
    .click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Week of [A-Z][a-z]+ \d+$/)
  await thisWeek(page)

  await expect(cell(page, 'Job hunt', 'finished').getByRole('link')).toHaveText([
    'Apply to Acme',
    'Rewrite the CV',
  ])
  await expect(cell(page, 'Job hunt', 'started').getByRole('link')).toHaveText(
    'Prep for the interview',
  )
  // A dropped thing stays, struck through: dropping is a decision too.
  await expect(cell(page, 'Job hunt', 'dropped').getByRole('link')).toHaveClass(/line-through/)
  await expect(page.locator('[data-review-total]')).toContainText('2')
  // A project nothing happened in is named once, at the end.
  await expect(page.locator('[data-no-movement]')).toContainText('Quiet')
})

test('it shows work that was finished and then reopened, which Done does not', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'CTWS')
  const id = await makeTask(page, pid, '写迁移', { status: 'done' })
  await page.request.patch(`/api/v1/tasks/${id}`, { headers: WEB, data: { status: 'todo' } })

  // THE CASE THE VIEW EXISTS FOR. Finishing something on Tuesday is work done even if it came
  // back on Thursday.
  await page.goto('/review')
  await thisWeek(page)
  await expect(cell(page, 'CTWS', 'finished')).toContainText('写迁移')

  await page
    .getByRole('navigation', { name: 'Weeks' })
    .getByRole('button', { name: 'Done' })
    .click()
  await expect(page.getByText('Nothing finished yet')).toBeVisible()
})

test('a week with nothing in it says so', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/review')
  await expect(page.getByText('Nothing happened this week')).toBeVisible()
})

test('it opens on last week; forward reaches this one and stops there', async ({ page }) => {
  await registerFreshUser(page)
  await seed(page)
  await page.goto('/review')

  const forward = page.getByRole('button', { name: 'Next week' })
  const weeks = page.getByRole('navigation', { name: 'Weeks' })
  // Last week: the seed happened this week, so here nothing did.
  await expect(page).not.toHaveURL(/week=/)
  await expect(page.getByText('Nothing happened this week')).toBeVisible()
  await expect(weeks.locator('[aria-current="true"]')).not.toContainText('so far')

  await forward.click()
  await expect(page).toHaveURL(/week=\d{4}-\d{2}-\d{2}/)
  await expect(forward).toBeDisabled()
  await expect(weeks.locator('[aria-current="true"]')).toContainText('so far')
  await expect(cell(page, 'Job hunt', 'finished')).toContainText('Rewrite the CV')

  // The weeks are a list: ↓ steps back to the older one.
  await weeks.locator('[aria-current="true"]').press('ArrowDown')
  await expect(page).not.toHaveURL(/week=/)
  await expect(page.getByRole('button', { name: 'Previous week' })).toBeEnabled()
})

test('the leaves of one parent are one line, opened to show them', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'CTWS')
  const parent = await makeTask(page, pid, 'Redesign')
  for (const title of ['Calendar', 'Review', 'Workbench'])
    await makeTask(page, pid, title, { status: 'done' }, parent)
  await makeTask(page, pid, 'Release', { status: 'done' })
  await page.goto('/review')
  await thisWeek(page)

  const finished = cell(page, 'CTWS', 'finished')
  const redesign = finished.getByRole('button', { name: /Redesign/ })
  await expect(redesign).toContainText('3')
  await expect(finished).not.toContainText('Calendar')
  await redesign.click()
  await expect(finished).toContainText('Calendar')
  await expect(finished).toContainText('Release')
})
