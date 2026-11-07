import { expect, test, type Page } from '@playwright/test'
import {
  makeProject,
  makeTask,
  registerFreshUser,
  serverTask,
  taskMoved,
  taskPatched,
} from './helpers'
import { dayOffset } from './days'

/**
 * A one-click edit answers at once and the save follows: finishing a task or moving its day can
 * be taken back from the line at the foot, or with Ctrl Z; a save that fails puts the row back
 * and offers to try again.
 */

// The line at the foot; dnd-kit keeps a live region of its own beside it.
const foot = (page: Page) => page.locator('[data-toast]')

test('a task finished on Today can be undone from the line at the foot', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '撤销')
  await makeTask(page, pid, '先做完', { status: 'in_progress' })
  await page.reload()
  const saved = taskPatched(page)
  await page.getByRole('button', { name: 'Mark “先做完” done' }).click()
  await saved
  await expect(foot(page)).toContainText('Done')
  expect((await serverTask(page, pid, '先做完')).status).toBe('done')

  const back = taskPatched(page)
  await foot(page).getByRole('button', { name: 'Undo' }).click()
  await back
  await expect(foot(page)).toHaveCount(0)
  // Back where it was: in progress, not merely open.
  expect((await serverTask(page, pid, '先做完')).status).toBe('in_progress')
  await expect(page.getByRole('region', { name: 'In progress', exact: true })).toContainText(
    '先做完',
  )
})

test('Ctrl Z takes back a planned day, and does nothing a second time', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '挪日子')
  await makeTask(page, pid, '排到今天')
  await page.reload()
  const moved = taskPatched(page)
  await page.getByRole('button', { name: 'Plan “排到今天” for today' }).click()
  await moved
  await expect(foot(page)).toContainText('Plan changed')
  expect((await serverTask(page, pid, '排到今天')).scheduledOn).toBe(dayOffset(0))

  const back = taskPatched(page)
  await page.locator('body').press('ControlOrMeta+z')
  await back
  expect((await serverTask(page, pid, '排到今天')).scheduledOn).toBeNull()
  await expect(foot(page)).toHaveCount(0)
  // Taken once: a second Ctrl Z finds nothing to send.
  let sent = false
  page.on('request', (r) => {
    if (r.method() === 'PATCH') sent = true
  })
  await page.locator('body').press('ControlOrMeta+z')
  await expect(page.getByRole('button', { name: 'Plan “排到今天” for today' })).toBeVisible()
  expect(sent).toBe(false)
})

test('a save that fails puts the row back and offers to try again', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '失败')
  await makeTask(page, pid, '存不上', { status: 'in_progress' })
  await page.reload()
  let refuse = true
  await page.route('**/api/v1/tasks/*', (route) =>
    refuse && route.request().method() === 'PATCH'
      ? route.fulfill({ status: 503, body: '' })
      : route.fallback(),
  )
  await page.getByRole('button', { name: 'Mark “存不上” done' }).click()
  await expect(foot(page)).toContainText('Couldn’t save. Try again')
  const inProgress = page.getByRole('region', { name: 'In progress', exact: true })
  await expect(inProgress).toContainText('存不上')
  expect((await serverTask(page, pid, '存不上')).status).toBe('in_progress')

  refuse = false
  const saved = taskPatched(page)
  await foot(page).getByRole('button', { name: 'Retry' }).click()
  await saved
  expect((await serverTask(page, pid, '存不上')).status).toBe('done')
})

test('Retry while offline says so and leaves the page as it is', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '断网')
  await makeTask(page, pid, '再试', { status: 'in_progress' })
  await page.reload()
  await page.route('**/api/v1/tasks/*', (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({ status: 503, body: '' })
      : route.fallback(),
  )
  await page.getByRole('button', { name: 'Mark “再试” done' }).click()
  await expect(foot(page)).toContainText('Couldn’t save. Try again')

  await page.context().setOffline(true)
  let sent = false
  page.on('request', (r) => {
    if (r.method() === 'PATCH') sent = true
  })
  await foot(page).getByRole('button', { name: 'Retry' }).click()
  await expect(foot(page)).toContainText('Offline. Nothing can be saved')
  const inProgress = page.getByRole('region', { name: 'In progress', exact: true })
  await expect(inProgress).toContainText('再试')
  expect(sent).toBe(false)
  await page.context().setOffline(false)
})

test('a row moved in the tree goes back where it was with Undo', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '挪位置')
  for (const title of ['one', 'two', 'three']) await makeTask(page, pid, title)
  await page.goto(`/projects/${pid}`)
  const rows = page.locator('[data-task-tree] li[data-depth]')
  await expect(rows).toHaveText([/one/, /two/, /three/])

  const moved = taskMoved(page)
  await page.getByRole('button', { name: 'Task: three', exact: true }).focus()
  await page.keyboard.press('Alt+ArrowUp')
  await moved
  await expect(rows).toHaveText([/one/, /three/, /two/])
  await expect(foot(page)).toContainText('Moved')

  const back = taskMoved(page)
  await foot(page).getByRole('button', { name: 'Undo' }).click()
  await back
  await expect(rows).toHaveText([/one/, /two/, /three/])
  await page.reload()
  await expect(rows).toHaveText([/one/, /two/, /three/])
})
