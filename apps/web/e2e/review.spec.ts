import { expect, test, type Page } from '@playwright/test'
import { registerFreshUser } from './helpers'

/**
 * 我做了什么 — the third v1 view. What it has to prove over 已完成 is that it reports what
 * HAPPENED, not what is true now.
 */

const HEADERS = { 'x-ctws-client': 'web' }

async function makeProject(page: Page, name: string): Promise<string> {
  const res = await page.request.post('/api/v1/projects', { headers: HEADERS, data: { name } })
  return ((await res.json()) as { id: string }).id
}

async function makeTask(page: Page, projectId: string, title: string): Promise<string> {
  const res = await page.request.post('/api/v1/tasks', {
    headers: HEADERS,
    data: { projectId, title, parentId: null },
  })
  return ((await res.json()) as { id: string }).id
}

const setStatus = (page: Page, id: string, status: string) =>
  page.request.patch(`/api/v1/tasks/${id}`, { headers: HEADERS, data: { status } })

const project = (page: Page, name: string) => page.getByRole('region', { name })

test('the review is a destination, grouped by line of work', async ({ page }) => {
  await registerFreshUser(page)
  const ctws = await makeProject(page, 'CTWS')
  const job = await makeProject(page, '求职')
  await setStatus(page, await makeTask(page, ctws, '配色重做'), 'done')
  await setStatus(page, await makeTask(page, ctws, 'Board'), 'in_progress')
  await setStatus(page, await makeTask(page, ctws, '再开一次会'), 'cancelled')
  await setStatus(page, await makeTask(page, job, '改简历'), 'done')

  await page.getByRole('link', { name: 'Review' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Review' })).toBeVisible()

  await expect(project(page, 'CTWS')).toContainText('配色重做')
  await expect(project(page, 'CTWS')).toContainText('Board')
  await expect(project(page, 'CTWS')).toContainText('再开一次会')
  // Each line of work is its own block; nothing from one shows up under the other.
  await expect(project(page, '求职')).toContainText('改简历')
  await expect(project(page, '求职')).not.toContainText('配色重做')
})

test('it shows work that was finished and then reopened, which 已完成 does not', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'CTWS')
  const id = await makeTask(page, pid, '写迁移')
  await setStatus(page, id, 'done')
  await setStatus(page, id, 'todo')

  // THE CASE THE VIEW EXISTS FOR. Finishing something on Tuesday is work done even if it came
  // back on Thursday, and a recount that hides it is one nobody opens twice.
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

test('last week is one press away, and so is the way back', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'CTWS')
  await setStatus(page, await makeTask(page, pid, '这周做完的'), 'done')
  await page.goto('/tasks/review')
  await expect(project(page, 'CTWS')).toContainText('这周做完的')

  // The week is a stepper now, not a lone "Last week" link: back, forward, and a way home.
  await page.getByRole('button', { name: 'The week before' }).click()
  await expect(page.getByText('Nothing happened this week')).toBeVisible()
  await page.getByRole('button', { name: 'This week', exact: true }).last().click()
  await expect(project(page, 'CTWS')).toContainText('这周做完的')
})
