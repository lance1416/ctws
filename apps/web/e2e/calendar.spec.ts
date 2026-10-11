import { expect, test, type Page } from '@playwright/test'
import { dayOffset } from './days'
import { makeProject, makeTask, registerFreshUser, WEB } from './helpers'

/**
 * THE CALENDAR -- the shell surface that is about every module at once.
 *
 * The claim worth testing is not that a grid renders: it is that the grid belongs to the SHELL
 * and the contents belong to the modules. Two modules put things on it, each with its own word
 * for what the date means, and the shell neither knows nor says which is which.
 */

const square = (page: Page, day: string) => page.locator(`[data-day="${day}"]`)

async function book(page: Page, title: string, planOn: string): Promise<string> {
  const res = await page.request.post('/api/v1/reading', {
    headers: WEB,
    data: { kind: 'book', title },
  })
  const { id } = (await res.json()) as { id: string }
  await page.request.patch(`/api/v1/reading/${id}`, { headers: WEB, data: { planOn } })
  return id
}

test('both modules put their dated things on one grid', async ({ page }) => {
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, 'CTWS')
  await makeTask(page, pid, '配色重做', { scheduledOn: dayOffset(1) })
  await book(page, '设计心理学', dayOffset(2))
  await page.goto('/calendar')

  await expect(square(page, dayOffset(1))).toContainText('配色重做')
  await expect(square(page, dayOffset(2))).toContainText('设计心理学')
})

test('one task with a plan and a deadline lands on two squares', async ({ page }) => {
  // They are different facts about the same task, and a grid that showed one would silently drop
  // the other.
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, 'CTWS')
  await makeTask(page, pid, '发版', {
    scheduledOn: dayOffset(1),
    dueAt: `${dayOffset(4)}T09:00:00.000Z`,
  })
  await page.goto('/calendar')

  await expect(square(page, dayOffset(1))).toContainText('发版')
  await expect(square(page, dayOffset(4))).toContainText('发版')
})

test('the view tabs show one module at a time', async ({ page }) => {
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, 'CTWS')
  await makeTask(page, pid, '配色重做', { scheduledOn: dayOffset(1) })
  await book(page, '设计心理学', dayOffset(1))
  await page.goto('/calendar')

  await page.getByRole('tab', { name: 'Reading' }).click()
  await expect(square(page, dayOffset(1))).toContainText('设计心理学')
  await expect(square(page, dayOffset(1))).not.toContainText('配色重做')

  // The chosen view is in the URL, so a reload lands where the person was.
  await expect(page).toHaveURL(/view=reading/)
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Reading' })).toHaveAttribute('aria-selected', 'true')

  await page.getByRole('tab', { name: 'All' }).click()
  await expect(square(page, dayOffset(1))).toContainText('配色重做')
})

test('a crowded square says how many it is not showing', async ({ page }) => {
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, 'CTWS')
  for (const title of ['一件', '二件', '三件', '四件', '五件']) {
    await makeTask(page, pid, title, { scheduledOn: dayOffset(1) })
  }
  await page.goto('/calendar')

  // Three, then the count. A square that grew with its contents would break the grid.
  await expect(square(page, dayOffset(1)).getByRole('link')).toHaveCount(3)
  await expect(square(page, dayOffset(1))).toContainText('+2')
})

test('the months step, and This month comes back', async ({ page }) => {
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, 'CTWS')
  await makeTask(page, pid, '这个月的', { scheduledOn: dayOffset(1) })
  await page.goto('/calendar')
  await expect(square(page, dayOffset(1))).toContainText('这个月的')

  // Two months forward is far enough that the day cannot still be on the grid as a neighbour.
  await page.getByRole('button', { name: 'Next month' }).click()
  await page.getByRole('button', { name: 'Next month' }).click()
  await expect(square(page, dayOffset(1))).toHaveCount(0)

  await page.getByRole('button', { name: 'Back to this month' }).click()
  await expect(square(page, dayOffset(1))).toContainText('这个月的')
})

test('a finished thing leaves the grid, because the calendar is about what is ahead', async ({
  page,
}) => {
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, 'CTWS')
  const id = await makeTask(page, pid, '做完的', { scheduledOn: dayOffset(1) })
  await page.goto('/calendar')
  await expect(square(page, dayOffset(1))).toContainText('做完的')

  await page.request.patch(`/api/v1/tasks/${id}`, { headers: WEB, data: { status: 'done' } })
  await page.reload()
  await expect(square(page, dayOffset(1))).not.toContainText('做完的')
})

test('g c goes to the calendar', async ({ page }) => {
  await registerFreshUser(page, '/')
  await page.keyboard.press('g')
  await page.keyboard.press('c')
  await expect(page).toHaveURL(/\/calendar$/)
  await expect(page.getByRole('heading', { name: 'Calendar', level: 1 })).toBeVisible()
})

test('生日落在服务端说的那一天，点它开那个人的那一层', async ({ page }) => {
  await registerFreshUser(page)
  // 公历的今天：格子一定在这个月的视图里。农历落在自己那天这件事，由 core 的单测和
  // `/contacts/calendar` 的 API 测试用固定日期钉住 —— 这里验的是格子把它画在服务端说的那天。
  const [, month, day] = dayOffset(0).split('-').map(Number) as [number, number, number]
  const res = await page.request.post('/api/v1/contacts', {
    headers: WEB,
    data: { name: '周楠', birthday: { calendar: 'solar', year: 1991, month, day } },
  })
  expect(res.ok()).toBe(true)

  await page.goto('/calendar')
  await expect(square(page, dayOffset(0))).toContainText('周楠')
  await square(page, dayOffset(0)).getByRole('link', { name: /周楠/ }).click()
  await expect(page.getByRole('dialog', { name: 'Contacts' })).toContainText('周楠')
})

test('格子里有农历日，和服务端说的一样', async ({ page }) => {
  await registerFreshUser(page)
  const today = dayOffset(0)
  const answer = await page.request.get(`/api/v1/calendar/days?from=${today}&to=${today}`, {
    headers: WEB,
  })
  expect(answer.ok()).toBe(true)
  const label = ((await answer.json()) as { days: Record<string, string> }).days[today]
  expect(label).toBeTruthy()

  await page.goto('/calendar')
  await expect(square(page, today).locator('[data-lunar-day]')).toHaveText(label!)
})
