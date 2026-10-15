import { expect, test, type Page } from '@playwright/test'
import { makeProject, makeTask, registerFreshUser } from './helpers'

/**
 * THE BOARD, AND THE BLOCK-HEADER TABS IT IS THE FIRST USER OF.
 *
 * A board is not a page: it is a second VIEW of the task block already on the project page. The
 * assertions below are as much about that -- one URL, one block, the capture box unchanged -- as
 * they are about the columns.
 */

const column = (page: Page, status: string) => page.locator(`[data-board-column="${status}"]`)
const card = (page: Page, title: string) =>
  page.locator('[data-board-card]').filter({ hasText: title })

async function openBoard(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`)
  await page.getByRole('listitem').first().waitFor()
  await page.getByRole('tab', { name: 'Board' }).click()
  await column(page, 'todo').waitFor()
}

test('the board is a view of the task block, not a page of its own', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  await makeTask(page, pid, '配色重做', { status: 'in_progress' })
  await openBoard(page, pid)

  // Same page, same block, same project banner above it. Only the rows are drawn differently.
  await expect(page).toHaveURL(new RegExp(`/projects/${pid}\\?view=tasks%3Aboard$`))
  await expect(page.getByRole('heading', { level: 1, name: '改版' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Tasks' })).toBeVisible()
  // The one-line capture box stays: adding to this project is the same action either way.
  await expect(page.getByRole('textbox', { name: 'New task' })).toBeVisible()
  // And the tree is gone -- it is the other view, not a thing hidden under this one.
  await expect(page.locator('[data-task-tree]')).toHaveCount(0)
})

test('the chosen view survives a reload, because it is in the URL', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  await makeTask(page, pid, '配色重做')
  await openBoard(page, pid)

  await page.reload()
  await expect(column(page, 'todo')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Board' })).toHaveAttribute('aria-selected', 'true')

  // Back to the list, and the parameter goes with it.
  await page.getByRole('tab', { name: 'List' }).click()
  await expect(page.locator('[data-task-tree]')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'List' })).toHaveAttribute('aria-selected', 'true')
})

test('every task appears once, in its own column, with its parent named', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  const parent = await makeTask(page, pid, '接入 KaTeX')
  await makeTask(page, pid, '装依赖', { status: 'done' }, parent)
  await makeTask(page, pid, '公式换行', { status: 'in_progress' }, parent)
  await makeTask(page, pid, '写变更日志')
  await openBoard(page, pid)

  // FLAT: the parent is a card of its own, beside its children, not a container around them.
  await expect(column(page, 'todo').locator('[data-board-card]')).toHaveCount(2)
  await expect(column(page, 'done').locator('[data-board-card]')).toHaveCount(1)
  await expect(column(page, 'in_progress').locator('[data-board-card]')).toHaveCount(1)
  await expect(card(page, '装依赖')).toHaveCount(1)
  // A card is never orphaned from the work it belongs to.
  await expect(card(page, '装依赖')).toContainText('接入 KaTeX')

  // `cancelled` has no column: it is not a step of the work.
  await expect(column(page, 'cancelled')).toHaveCount(0)
})

test('dragging a card to another column writes that status', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  const id = await makeTask(page, pid, '配色重做')
  await openBoard(page, pid)
  await expect(column(page, 'todo').locator('[data-board-card]')).toHaveCount(1)

  const patched = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.ok() && r.url().includes(id),
  )
  await card(page, '配色重做').hover()
  await page.mouse.down()
  // Two moves: the first clears the 5px threshold, the second lands it.
  const target = (await column(page, 'in_progress').boundingBox())!
  await page.mouse.move(target.x + target.width / 2, target.y + 30, { steps: 8 })
  await page.mouse.move(target.x + target.width / 2, target.y + 40, { steps: 4 })
  await page.mouse.up()

  // It is the SAME mutation the row markers use, so a card and a marker cannot disagree about
  // what a status change means.
  expect((await patched).request().postDataJSON()).toEqual({ status: 'in_progress' })
  await expect(column(page, 'in_progress').locator('[data-board-card]')).toHaveCount(1)
  await expect(column(page, 'todo').locator('[data-board-card]')).toHaveCount(0)

  const server = await (await page.request.get(`/api/v1/tasks?projectId=${pid}`)).json()
  expect(server.tasks[0].status).toBe('in_progress')
})

test('an empty project says so once, not four times', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '空的')
  await page.goto(`/projects/${pid}?view=tasks:board`)
  await expect(page.getByText('No tasks in this project yet')).toHaveCount(1)
  await expect(page.locator('[data-board-column]')).toHaveCount(0)
})

test('a board that cannot load says so, instead of four empty columns', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Down')
  await makeTask(page, pid, 'Somewhere')
  await page.route('**/api/v1/tasks?projectId=*', (r) => r.fulfill({ status: 503, body: '{}' }))
  await page.goto(`/projects/${pid}?view=tasks:board`)
  await expect(page.getByRole('alert')).toContainText("Couldn't load tasks")
  await expect(page.locator('[data-board-column]')).toHaveCount(0)
})
