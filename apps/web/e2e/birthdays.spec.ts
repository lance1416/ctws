import { expect, test, type Page } from '@playwright/test'
import { dayOffset } from './days'
import { registerFreshUser, WEB } from './helpers'

/**
 * BIRTHDAYS -- the lens over the people who have one.
 *
 * What is tested here is the page's own claims: who is in which segment, that a lunar birthday
 * lands on its own day rather than the solar date somebody was born on, that the month index is
 * the date search, and that nobody appears twice.
 */

/** Writes a person down, birthday and all. Returns their id. */
async function person(page: Page, name: string, birthday?: unknown, circle?: string) {
  const res = await page.request.post('/api/v1/contacts', {
    headers: WEB,
    data: { name, ...(birthday ? { birthday } : {}), ...(circle ? { circle } : {}) },
  })
  expect(res.ok()).toBe(true)
  return ((await res.json()) as { id: string }).id
}

/** The month and day `n` days from today, in the runner's zone -- which is the account's. */
function monthDay(offset: number): { month: number; day: number } {
  const [, m, d] = dayOffset(offset).split('-').map(Number) as [number, number, number]
  return { month: m, day: d }
}

const rows = (page: Page) => page.locator('[data-birthday-row]')

test('七天内的人在 Coming up，其余在 Later，并且每个人只出现一次', async ({ page }) => {
  await registerFreshUser(page)
  await person(page, '王颖', { calendar: 'solar', year: 1993, ...monthDay(0) }, 'friend')
  await person(page, '林哲', { calendar: 'solar', year: 1985, ...monthDay(3) }, 'work')
  await person(page, '李雷', { calendar: 'solar', year: 1996, ...monthDay(40) })

  await page.goto('/contacts/birthdays')
  const coming = page.getByRole('region', { name: 'Coming up' })
  const later = page.getByRole('region', { name: 'Later' })
  await expect(coming.locator('[data-birthday-row]')).toHaveCount(2)
  await expect(later.locator('[data-birthday-row]')).toHaveCount(1)
  await expect(coming).toContainText('today')
  await expect(coming).toContainText('in 3 days')
  // Nobody is in two segments: that is why there is no "earlier this year" section.
  await expect(rows(page)).toHaveCount(3)
})

test('农历生日落在它自己的那一天，并带着农历回显', async ({ page }) => {
  await registerFreshUser(page)
  // 1991 年农历九月初三 = 公历 1991-10-10，但复发按农历走。
  await person(page, '周楠', { calendar: 'lunar', year: 1991, month: 9, day: 3 })
  await page.goto('/contacts/birthdays')
  const row = rows(page).filter({ hasText: '周楠' })
  await expect(row).toContainText('农历九月初三')
  await expect(row).toContainText('turns')
})

test('月份索引是日期检索：点一个月，列表只剩那个月的人', async ({ page }) => {
  await registerFreshUser(page)
  await person(page, '四月的人', { calendar: 'solar', year: 1996, month: 4, day: 15 })
  await person(page, '十月的人', { calendar: 'solar', year: 1996, month: 10, day: 20 })
  await page.goto('/contacts/birthdays')
  const byMonth = page.getByRole('region', { name: 'By month' })
  const april = byMonth.getByRole('button', { name: /^April/ })
  await expect(april).toContainText('1')
  await april.click()
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page)).toContainText('四月的人')
})

test('名字搜索按输入过滤', async ({ page }) => {
  await registerFreshUser(page)
  await person(page, '周楠', { calendar: 'solar', year: 1991, ...monthDay(1) })
  await person(page, 'Priya Raman', { calendar: 'solar', year: 1988, ...monthDay(2) })
  await page.goto('/contacts/birthdays')
  await page.getByRole('searchbox', { name: 'Find a person' }).fill('priya')
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page)).toContainText('Priya Raman')
})

test('在这一页写下一个人，用的是 contacts 自己的那个对话框', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/contacts/birthdays')
  await page.getByRole('button', { name: 'New person' }).click()
  const dialog = page.getByRole('dialog', { name: 'New contact' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('textbox', { name: 'Name' }).fill('新来的')
  await dialog.getByRole('button', { name: 'Create' }).click()
  // It lands on the person's own page -- the shell's, the same one every kind of thing gets.
  await expect(page).toHaveURL(new RegExp('/contacts/[0-9a-f-]{36}$'))
  await expect(page.getByRole('region', { name: 'Person at a glance' })).toContainText('新来的')
})

test('这一页在 375 下没有横向滚动', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await registerFreshUser(page)
  await person(page, '名字很长的一个人物名字', {
    calendar: 'lunar',
    year: 1944,
    month: 12,
    day: 30,
  })
  await page.goto('/contacts/birthdays')
  await expect(rows(page)).toHaveCount(1)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})

test('1440 下列表占两栏，索引在第三栏', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await registerFreshUser(page)
  await person(page, '王颖', { calendar: 'solar', year: 1993, ...monthDay(0) })
  await page.goto('/contacts/birthdays')
  const coming = page.getByRole('region', { name: 'Coming up' })
  const byMonth = page.getByRole('region', { name: 'By month' })
  const [list, index] = await Promise.all([coming.boundingBox(), byMonth.boundingBox()])
  expect(list).not.toBeNull()
  expect(index).not.toBeNull()
  // The index is BESIDE the list, not under it, and the list is the wider of the two.
  expect(index!.x).toBeGreaterThan(list!.x + list!.width - 4)
  expect(list!.width).toBeGreaterThan(index!.width * 1.5)
})

test('rail 上有它，并且数的是未来一周', async ({ page }) => {
  await registerFreshUser(page)
  await person(page, '今天的', { calendar: 'solar', year: 1990, ...monthDay(0) })
  await person(page, '很久以后的', { calendar: 'solar', year: 1990, ...monthDay(60) })
  await page.goto('/today')
  const row = page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: /Birthdays/ })
  await expect(row).toContainText('1')
  await row.click()
  await expect(page.getByRole('heading', { level: 1, name: 'Birthdays' })).toBeVisible()
})
