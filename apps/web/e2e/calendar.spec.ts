import { expect, test, type Page } from '@playwright/test'
import { dayOffset } from './days'
import { registerFreshUser } from './helpers'

/**
 * 日程 -- the shell surface that is about every module at once.
 *
 * The claim worth testing is not that a grid renders: it is that the grid belongs to the SHELL
 * and the contents belong to the modules. Two modules put things on it, each with its own word
 * for what the date means, and the shell neither knows nor says which is which.
 */

const HEADERS = { 'x-ctws-client': 'web' }

const square = (page: Page, day: string) => page.locator(`[data-day="${day}"]`)

async function project(page: Page, name: string): Promise<string> {
  const res = await page.request.post('/api/v1/projects', { headers: HEADERS, data: { name } })
  return ((await res.json()) as { id: string }).id
}

async function task(
  page: Page,
  projectId: string,
  title: string,
  patch: Record<string, unknown>,
): Promise<string> {
  const res = await page.request.post('/api/v1/tasks', {
    headers: HEADERS,
    data: { projectId, title, parentId: null },
  })
  const { id } = (await res.json()) as { id: string }
  await page.request.patch(`/api/v1/tasks/${id}`, { headers: HEADERS, data: patch })
  return id
}

async function book(page: Page, title: string, planOn: string): Promise<string> {
  const res = await page.request.post('/api/v1/reading', {
    headers: HEADERS,
    data: { kind: 'book', title },
  })
  const { id } = (await res.json()) as { id: string }
  await page.request.patch(`/api/v1/reading/${id}`, { headers: HEADERS, data: { planOn } })
  return id
}

test('both modules put their dated things on one grid', async ({ page }) => {
  await registerFreshUser(page, '/')
  const pid = await project(page, 'CTWS')
  await task(page, pid, '配色重做', { scheduledOn: dayOffset(1) })
  await book(page, '设计心理学', dayOffset(2))
  await page.goto('/calendar')

  await expect(square(page, dayOffset(1))).toContainText('配色重做')
  await expect(square(page, dayOffset(2))).toContainText('设计心理学')
})

test('one task with a plan and a deadline lands on two squares', async ({ page }) => {
  // They are different facts about the same task, and a grid that showed one would silently drop
  // the other.
  await registerFreshUser(page, '/')
  const pid = await project(page, 'CTWS')
  await task(page, pid, '发版', {
    scheduledOn: dayOffset(1),
    dueAt: `${dayOffset(4)}T09:00:00.000Z`,
  })
  await page.goto('/calendar')

  await expect(square(page, dayOffset(1))).toContainText('发版')
  await expect(square(page, dayOffset(4))).toContainText('发版')
})

test('the view tabs show one module at a time', async ({ page }) => {
  await registerFreshUser(page, '/')
  const pid = await project(page, 'CTWS')
  await task(page, pid, '配色重做', { scheduledOn: dayOffset(1) })
  await book(page, '设计心理学', dayOffset(1))
  await page.goto('/calendar')

  await page.getByRole('tab', { name: '待读' }).click()
  await expect(square(page, dayOffset(1))).toContainText('设计心理学')
  await expect(square(page, dayOffset(1))).not.toContainText('配色重做')

  // The chosen view is in the URL, so a reload lands where the person was.
  await expect(page).toHaveURL(/view=reading/)
  await page.reload()
  await expect(page.getByRole('tab', { name: '待读' })).toHaveAttribute('aria-selected', 'true')

  await page.getByRole('tab', { name: '全部' }).click()
  await expect(square(page, dayOffset(1))).toContainText('配色重做')
})

test('a crowded square says how many it is not showing', async ({ page }) => {
  await registerFreshUser(page, '/')
  const pid = await project(page, 'CTWS')
  for (const title of ['一件', '二件', '三件', '四件', '五件']) {
    await task(page, pid, title, { scheduledOn: dayOffset(1) })
  }
  await page.goto('/calendar')

  // Three, then the count. A square that grew with its contents would break the grid.
  await expect(square(page, dayOffset(1)).getByRole('link')).toHaveCount(3)
  await expect(square(page, dayOffset(1))).toContainText('+2')
})

test('the months step, and 本月 comes back', async ({ page }) => {
  await registerFreshUser(page, '/')
  const pid = await project(page, 'CTWS')
  await task(page, pid, '这个月的', { scheduledOn: dayOffset(1) })
  await page.goto('/calendar')
  await expect(square(page, dayOffset(1))).toContainText('这个月的')

  // Two months forward is far enough that the day cannot still be on the grid as a neighbour.
  await page.getByRole('button', { name: '下个月' }).click()
  await page.getByRole('button', { name: '下个月' }).click()
  await expect(square(page, dayOffset(1))).toHaveCount(0)

  await page.getByRole('button', { name: '回到本月' }).click()
  await expect(square(page, dayOffset(1))).toContainText('这个月的')
})

test('a finished thing leaves the grid, because the calendar is about what is ahead', async ({
  page,
}) => {
  await registerFreshUser(page, '/')
  const pid = await project(page, 'CTWS')
  const id = await task(page, pid, '做完的', { scheduledOn: dayOffset(1) })
  await page.goto('/calendar')
  await expect(square(page, dayOffset(1))).toContainText('做完的')

  await page.request.patch(`/api/v1/tasks/${id}`, { headers: HEADERS, data: { status: 'done' } })
  await page.reload()
  await expect(square(page, dayOffset(1))).not.toContainText('做完的')
})

test('g c goes to the calendar', async ({ page }) => {
  await registerFreshUser(page, '/')
  await page.keyboard.press('g')
  await page.keyboard.press('c')
  await expect(page).toHaveURL(/\/calendar$/)
  await expect(page.getByRole('heading', { name: '日程', level: 1 })).toBeVisible()
})
