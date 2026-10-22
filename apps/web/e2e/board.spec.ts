import { expect, test, type Page } from '@playwright/test'
import {
  completedAt,
  makeProject,
  makeTask,
  registerFreshUser,
  serverTasks,
  taskPatched,
} from './helpers'

/**
 * THE BOARD BY STATUS (FR-057, artboard 21): a second view of the project's tasks, on the same
 * page and address. Only leaves are cards; each column groups them under their top-level parent,
 * the project's own first; Backlog and Cancelled wait as strips at the sides.
 */

const column = (page: Page, status: string) => page.locator(`[data-board-column="${status}"]`)
const strip = (page: Page, status: string) => page.locator(`[data-board-strip="${status}"]`)
/** A card by its name, not by the path under it ("Batch 3" is a parent's name there too). */
const card = (page: Page, title: string) =>
  page
    .locator('[data-board-card]')
    .filter({ has: page.locator('[data-board-title]').getByText(title, { exact: true }) })
const cardsIn = (page: Page, status: string) => column(page, status).locator('[data-board-card]')
const head = (page: Page, status: string, name: string | RegExp) =>
  column(page, status).getByRole('button', { name })

async function openBoard(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`)
  await page.getByRole('listitem').first().waitFor()
  await page.getByRole('tab', { name: 'Board' }).click()
  await column(page, 'todo').waitFor()
}

/** Drags a card by the pointer onto a column or strip, past the 5px that tells it from a click. */
async function drag(page: Page, from: ReturnType<typeof card>, to: ReturnType<typeof column>) {
  await from.hover()
  await page.mouse.down()
  const target = (await to.boundingBox())!
  await page.mouse.move(target.x + target.width / 2, target.y + 30, { steps: 8 })
  await page.mouse.move(target.x + target.width / 2, target.y + 40, { steps: 4 })
  await page.mouse.up()
}

test('the board is a view of the task block, not a page of its own', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  await makeTask(page, pid, '配色重做', { status: 'in_progress' })
  await openBoard(page, pid)

  // Same page, same block, same project banner above it. Only the rows are drawn differently.
  await expect(page).toHaveURL(new RegExp(`/projects/${pid}\\?view=board$`))
  await expect(page.getByRole('heading', { level: 1, name: '改版' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Tasks' })).toBeVisible()
  // Adding is the same action either way; on the board it heads To do.
  await expect(column(page, 'todo').getByRole('textbox', { name: 'New task' })).toBeVisible()
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
  await page.getByRole('tab', { name: 'Tree' }).click()
  await expect(page.locator('[data-task-tree]')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Tree' })).toHaveAttribute('aria-selected', 'true')
})

test('only leaves are cards, grouped under their top-level parent, the project’s own first', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  const parent = await makeTask(page, pid, '接入 KaTeX')
  const batch = await makeTask(page, pid, 'Batch 3', {}, parent)
  await makeTask(page, pid, '公式换行', { status: 'in_progress' }, batch)
  await makeTask(page, pid, '装依赖', { status: 'in_progress' }, parent)
  await makeTask(page, pid, '写变更日志', { status: 'in_progress' })
  await openBoard(page, pid)

  // A parent is never a card: its status is its children's.
  await expect(card(page, '接入 KaTeX')).toHaveCount(0)
  await expect(card(page, 'Batch 3')).toHaveCount(0)
  await expect(cardsIn(page, 'in_progress')).toHaveText([/写变更日志/, /公式换行/, /装依赖/])
  // Its group's head names it and counts its cards in this column.
  await expect(head(page, 'in_progress', /接入 KaTeX/)).toContainText('2')
  // The steps between the head and a deeper card are said under the card's name.
  await expect(card(page, '公式换行').locator('[data-board-path]')).toHaveText('Batch 3')
  await expect(card(page, '装依赖').locator('[data-board-path]')).toHaveCount(0)

  // A group folds to its head, and opens again.
  await head(page, 'in_progress', /接入 KaTeX/).click()
  await expect(cardsIn(page, 'in_progress')).toHaveText([/写变更日志/])
  await head(page, 'in_progress', /接入 KaTeX/).click()
  await expect(cardsIn(page, 'in_progress')).toHaveCount(3)
})

test('a group shows five cards and keeps the rest under “N more”, opened in place', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Many')
  const parent = await makeTask(page, pid, 'Redesign')
  for (let i = 1; i <= 7; i++) await makeTask(page, pid, `Step ${i}`, {}, parent)
  await openBoard(page, pid)

  await expect(cardsIn(page, 'todo')).toHaveCount(5)
  await column(page, 'todo').getByRole('button', { name: '2 more' }).click()
  await expect(cardsIn(page, 'todo')).toHaveCount(7)
  await expect(cardsIn(page, 'todo').last()).toContainText('Step 7')
})

test('Backlog and Cancelled wait as strips that say how many, and open into columns', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Sides')
  await makeTask(page, pid, 'Someday', { status: 'backlog' })
  await makeTask(page, pid, 'Maybe', { status: 'backlog' })
  await makeTask(page, pid, 'Dropped', { status: 'cancelled' })
  await makeTask(page, pid, 'Now')
  await openBoard(page, pid)

  await expect(column(page, 'backlog')).toHaveCount(0)
  await expect(strip(page, 'backlog')).toHaveAccessibleName('Backlog, 2')
  await expect(strip(page, 'cancelled')).toHaveAccessibleName('Cancelled, 1')

  await strip(page, 'backlog').click()
  await expect(cardsIn(page, 'backlog')).toHaveCount(2)
  await column(page, 'backlog').getByRole('button', { name: 'Hide Backlog' }).click()
  await expect(strip(page, 'backlog')).toBeVisible()
})

test('dragging a card to another column writes that status', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  await makeTask(page, pid, '配色重做')
  await openBoard(page, pid)
  await expect(cardsIn(page, 'todo')).toHaveCount(1)

  const patched = taskPatched(page)
  await drag(page, card(page, '配色重做'), column(page, 'in_progress'))

  // It is the SAME mutation the row markers use, so a card and a marker cannot disagree about
  // what a status change means.
  expect((await patched).request().postDataJSON()).toEqual({ status: 'in_progress' })
  await expect(cardsIn(page, 'in_progress')).toHaveCount(1)
  await expect(cardsIn(page, 'todo')).toHaveCount(0)

  const server = await serverTasks(page, pid)
  expect(server[0]!.status).toBe('in_progress')
})

test('a card dropped on a folded strip takes its status', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Later')
  await makeTask(page, pid, 'Not now')
  await openBoard(page, pid)

  const patched = taskPatched(page)
  await drag(page, card(page, 'Not now'), strip(page, 'backlog'))
  expect((await patched).request().postDataJSON()).toEqual({ status: 'backlog' })
  await expect(strip(page, 'backlog')).toHaveAccessibleName('Backlog, 1')
  await expect(cardsIn(page, 'todo')).toHaveCount(0)
})

test('Done shows this week’s, and all of it when asked', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Weeks')
  await makeTask(page, pid, 'Done just now', { status: 'done' })
  const old = await makeTask(page, pid, 'Done long ago', { status: 'done' })
  // A fixed day long past: never this week, whenever this runs.
  completedAt(old, '2019-03-14T12:00:00Z')
  // Straight to the board: the tree folds finished rows away and has no row to wait for.
  await page.goto(`/projects/${pid}?view=board`)

  await expect(cardsIn(page, 'done')).toHaveText([/Done just now/])
  await expect(
    column(page, 'done').getByRole('link', { name: 'Review this week' }),
  ).toHaveAttribute('href', '/review')
  await page.getByRole('tab', { name: 'All' }).click()
  await expect(cardsIn(page, 'done')).toHaveCount(2)
})

test('Stage is greyed, and says why, in a project without stages', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Flat')
  await makeTask(page, pid, 'One')
  await openBoard(page, pid)

  const stage = page.getByRole('tab', { name: 'Stage' })
  await expect(stage).toHaveAttribute('aria-disabled', 'true')
  await expect(stage).toHaveAttribute('title', 'No stages in this project yet')
  await expect(page.getByRole('tab', { name: 'Status' })).toHaveAttribute('aria-selected', 'true')
})

test('“New task” at the top of To do adds one there, with no dialog', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Adds')
  await page.goto(`/projects/${pid}?view=board`)

  const box = column(page, 'todo').getByRole('textbox', { name: 'New task' })
  await box.fill('Written on the board')
  await box.press('Enter')
  await expect(card(page, 'Written on the board')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(box).toHaveValue('')
})

test('an empty project’s board is its column heads and the way to add', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '空的')
  await page.goto(`/projects/${pid}?view=board`)
  await expect(page.locator('[data-board-column]')).toHaveCount(3)
  await expect(page.locator('[data-board-card]')).toHaveCount(0)
  await expect(column(page, 'todo').getByRole('textbox', { name: 'New task' })).toBeVisible()
})

test('a card opens its task, from the keyboard as from the pointer', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Keys')
  await makeTask(page, pid, 'Open me')
  await openBoard(page, pid)
  const pane = page.getByRole('dialog', { name: 'Task details' })

  await card(page, 'Open me').focus()
  await page.keyboard.press('Enter')
  await expect(pane.locator('[data-detail-title]')).toHaveText('Open me')
  await expect(page).toHaveURL(/[?&]task=/)
  await pane.getByRole('button', { name: 'Close' }).click()
  await expect(pane).toHaveCount(0)
  await expect(card(page, 'Open me')).toBeFocused()

  await card(page, 'Open me').click()
  await expect(pane.locator('[data-detail-title]')).toHaveText('Open me')
})

test('arrows move between cards, and Alt with an arrow moves a card a column', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Keys')
  await makeTask(page, pid, 'First')
  await makeTask(page, pid, 'Second')
  await makeTask(page, pid, 'Started', { status: 'in_progress' })
  await openBoard(page, pid)

  // The board is one tab stop: the first card.
  await expect(page.locator('[data-board-card][tabindex="0"]')).toHaveCount(1)
  await card(page, 'First').focus()
  await page.keyboard.press('ArrowDown')
  await expect(card(page, 'Second')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(card(page, 'Started')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(card(page, 'First')).toBeFocused()

  const patched = taskPatched(page)
  await page.keyboard.press('Alt+ArrowRight')
  expect((await patched).request().postDataJSON()).toEqual({ status: 'in_progress' })
  await expect(cardsIn(page, 'in_progress')).toHaveCount(2)
  // The card keeps focus in its new column.
  await expect(card(page, 'First')).toBeFocused()
})

test('a board that cannot load says so, instead of empty columns', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Down')
  await makeTask(page, pid, 'Somewhere')
  await page.route('**/api/v1/tasks?projectId=*', (r) => r.fulfill({ status: 503, body: '{}' }))
  await page.goto(`/projects/${pid}?view=board`)
  await expect(page.getByRole('alert')).toContainText('Couldn’t load the tasks')
  await expect(page.locator('[data-board-column]')).toHaveCount(0)
})
