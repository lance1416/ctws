import { expect, test, type Page } from '@playwright/test'
import { dayOffset } from './days'
import { pickOne, registerFreshUser, WEB } from './helpers'

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

test('人物页上生日是只读的派生值，改在一个地方', async ({ page }) => {
  await registerFreshUser(page)
  const id = await person(page, '周楠', {
    calendar: 'lunar',
    year: 1991,
    month: 9,
    day: 3,
    hourBranch: 6,
  })
  await page.goto(`/contacts/${id}`)
  const glance = page.getByRole('region', { name: 'Person at a glance' })
  await expect(glance).toContainText('农历辛未年九月初三')
  await expect(glance).toContainText('午时')
  await expect(glance).toContainText('羊')
  await expect(glance).toContainText('天秤')
  await expect(glance).toContainText('turns')
  // 派生值不是输入框：没有一个控件的无障碍名叫 Zodiac 或 Sign。
  await expect(glance.getByRole('button', { name: /Zodiac|Sign/ })).toHaveCount(0)
})

test('写一个农历生日，输入时就看见换算与回退', async ({ page }) => {
  await registerFreshUser(page)
  const id = await person(page, '外婆')
  await page.goto(`/contacts/${id}`)
  await page.getByRole('button', { name: 'Add a birthday' }).click()
  await page
    .getByRole('group', { name: 'Which calendar' })
    .getByRole('button', { name: 'Lunar' })
    .click()
  await page.getByRole('textbox', { name: 'Year' }).fill('1944')
  // The app's own picker, not a native select (`layers.test.ts` forbids those).
  await pickOne(page, 'Lunar month', '十二月')
  await pickOne(page, 'Lunar day', '三十')
  // 预览是服务端算的，所以这里等的是一次请求的结果，不是一个本地字符串。
  const preview = page.getByTestId('birthday-preview')
  await expect(preview).toContainText('1945-02-12')
  await expect(preview).toContainText('猴')
  await expect(preview).toContainText('has 29 days')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('region', { name: 'Person at a glance' })).toContainText(
    '农历甲申年十二月三十',
  )
})

test('联系人列表能按 circle 筛，而且不默认藏人', async ({ page }) => {
  await registerFreshUser(page)
  await person(page, '妈妈', undefined, 'family')
  await person(page, '同事老张', undefined, 'work')
  await page.goto('/contacts')
  const list = page.getByRole('listitem')
  await expect(list).toHaveCount(2)
  await page.getByRole('button', { name: 'Family' }).click()
  await expect(list).toHaveCount(1)
  await expect(list).toContainText('妈妈')
  await page.getByRole('button', { name: 'Everyone' }).click()
  await expect(list).toHaveCount(2)
})

test('只知月日的农历生日，一个 chip 都不画', async ({ page }) => {
  await registerFreshUser(page)
  // 农历月日对应的公历日期逐年移动，所以星座不唯一；生肖要年份。两个都没有，就什么都别画。
  const id = await person(page, '蒋老师', { calendar: 'lunar', month: 9, day: 3 })
  await page.goto(`/contacts/${id}`)
  const glance = page.getByRole('region', { name: 'Person at a glance' })
  await expect(glance).toContainText('农历九月初三')
  await expect(glance.locator('[data-birthday-chip]')).toHaveCount(0)
})

test('知道年份的人，生肖与星座各一个 chip', async ({ page }) => {
  await registerFreshUser(page)
  const id = await person(page, '周楠', { calendar: 'lunar', year: 1991, month: 9, day: 3 })
  await page.goto(`/contacts/${id}`)
  await expect(
    page.getByRole('region', { name: 'Person at a glance' }).locator('[data-birthday-chip]'),
  ).toHaveCount(2)
})

test('公历但不知年份：有星座，没有生肖，所以只有一个 chip', async ({ page }) => {
  await registerFreshUser(page)
  // 这一条是两个 chip 各自的守卫唯一管用的地方：两个都空时外层就不画了。
  const id = await person(page, '蒋老师', { calendar: 'solar', month: 11, day: 2 })
  await page.goto(`/contacts/${id}`)
  const chips = page
    .getByRole('region', { name: 'Person at a glance' })
    .locator('[data-birthday-chip]')
  await expect(chips).toHaveCount(1)
  await expect(chips).toHaveText('天蝎')
})
