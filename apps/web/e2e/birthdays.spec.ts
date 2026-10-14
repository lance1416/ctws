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
  const res = await page.request.post('/api/v1/people', {
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

/** The month names the app prints, so a spec can build the string the page will show. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * A BIRTHDAY'S ROW IS A PERSON'S ROW: the day in the margin with the cake, the thread, then who,
 * how old, and how far off at the far end. The heading above hangs where the threads do.
 */
test('a birthday row hangs on the margin: the day and its cake, then who, then how far off', async ({
  page,
}) => {
  await registerFreshUser(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await person(page, '王颖', { calendar: 'solar', year: 1993, ...monthDay(0) }, 'friend')
  await person(page, '林哲', { calendar: 'solar', year: 1985, ...monthDay(3) }, 'work')
  const view = (await (
    await page.request.get('/api/v1/people/birthdays', { headers: WEB })
  ).json()) as { coming: { name: string; day: string }[] }
  await page.goto('/people/birthdays')

  // The margin says the SERVER's day, as a month and a day, beside the cake.
  const said = (name: string) => {
    const [, m, d] = view.coming
      .find((r) => r.name === name)!
      .day.split('-')
      .map(Number)
    return `${MONTHS[m! - 1]} ${d}`
  }
  const lin = rows(page).filter({ hasText: '林哲' })
  const wang = rows(page).filter({ hasText: '王颖' })
  await expect(lin.locator('[data-birthday-lead] time')).toHaveText(said('林哲'))
  await expect(wang.locator('[data-birthday-lead] time')).toHaveText(said('王颖'))
  await expect(lin.locator('[data-birthday-lead] [data-cake]')).toHaveCount(1)
  // Today's is in a colour of its own; the far end already says "today" in words.
  const colour = (row: typeof lin) =>
    row.locator('[data-birthday-lead]').evaluate((el) => getComputedStyle(el).color)
  expect(await colour(wang)).not.toBe(await colour(lin))

  // How far off is at the far end, after who.
  const end = (await lin.getByRole('link').boundingBox())!
  const off = (await lin.getByText('in 3 days').boundingBox())!
  expect(end.x + end.width - (off.x + off.width)).toBeLessThan(12)

  // One x for the threads, and the page's heading hangs on it.
  const threads = await page
    .locator('[data-birthday-row] [data-thread]')
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().x)))
  expect(threads).toHaveLength(2)
  expect(new Set(threads).size).toBe(1)
  const h1 = (await page.getByRole('heading', { level: 1, name: 'People' }).boundingBox())!
  expect(Math.round(h1.x)).toBe(threads[0])

  // The whole body is the way to the person.
  await lin.getByText('in 3 days').click()
  await expect(page.getByRole('dialog', { name: 'People' })).toContainText('林哲')
})

test('七天内的人在 Coming up，其余在 Later，并且每个人只出现一次', async ({ page }) => {
  await registerFreshUser(page)
  await person(page, '王颖', { calendar: 'solar', year: 1993, ...monthDay(0) }, 'friend')
  await person(page, '林哲', { calendar: 'solar', year: 1985, ...monthDay(3) }, 'work')
  await person(page, '李雷', { calendar: 'solar', year: 1996, ...monthDay(40) })

  await page.goto('/people/birthdays')
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
  await page.goto('/people/birthdays')
  const row = rows(page).filter({ hasText: '周楠' })
  await expect(row).toContainText('农历九月初三')
  await expect(row).toContainText('turns')
})

test('月份索引是日期检索：点一个月，列表只剩那个月的人', async ({ page }) => {
  await registerFreshUser(page)
  await person(page, '四月的人', { calendar: 'solar', year: 1996, month: 4, day: 15 })
  await person(page, '十月的人', { calendar: 'solar', year: 1996, month: 10, day: 20 })
  await page.goto('/people/birthdays')
  const byMonth = page.getByRole('region', { name: 'By month' })
  const april = byMonth.getByRole('button', { name: /^April/ })
  await expect(april).toContainText('1')
  await april.click()
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page)).toContainText('四月的人')
})

/**
 * 页头那两个数说的是**屏幕上这些人**，不是库里所有人。
 *
 * 筛了之后下面的列表变短、上面的数不动，是两个互相矛盾的答案摆在同一屏上：按下 April 之后写着
 * 「2 people」而列表里只有一个人，读的人只能二选一相信。
 */
test('页头的人数跟着筛选走', async ({ page }) => {
  await registerFreshUser(page)
  // 两个生日都离今天远（两个月、五个月之后），而且不在同一个月：这条测试说的是筛选，不该在
  // 某一周因为哪天碰巧临近而变红 -- 日子从今天推，不写死。
  const far = monthDay(150)
  const near = monthDay(60)
  await person(page, '远的人', { calendar: 'solar', year: 1996, ...far })
  await person(page, '近些的人', { calendar: 'solar', year: 1996, ...near })
  await page.goto('/people/birthdays')
  const count = page.locator('[data-birthday-count]')
  await expect(count).toHaveText('2 people · 0 in the next week')

  const month = page
    .getByRole('region', { name: 'By month' })
    .getByRole('button', { name: new RegExp(`^${MONTH_NAMES[far.month - 1]}`) })
  await month.click()
  await expect(rows(page)).toHaveCount(1)
  await expect(count).toHaveText('1 person · 0 in the next week')

  // 搜索框是同一套筛选，所以它也得带着这个数走。
  await month.click()
  await page.getByRole('searchbox', { name: 'Find a person' }).fill('近些')
  await expect(rows(page)).toHaveCount(1)
  await expect(count).toHaveText('1 person · 0 in the next week')
})

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

test('名字搜索按输入过滤', async ({ page }) => {
  await registerFreshUser(page)
  await person(page, '周楠', { calendar: 'solar', year: 1991, ...monthDay(1) })
  await person(page, 'Priya Raman', { calendar: 'solar', year: 1988, ...monthDay(2) })
  await page.goto('/people/birthdays')
  await page.getByRole('searchbox', { name: 'Find a person' }).fill('priya')
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page)).toContainText('Priya Raman')
})

test('在这一页写下一个人，用的是 people 自己的那个对话框', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/people/birthdays')
  await page.getByRole('button', { name: 'New person' }).click()
  const dialog = page.getByRole('dialog', { name: 'New person' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('textbox', { name: 'Name' }).fill('新来的')
  await dialog.getByRole('button', { name: 'Create' }).click()
  // It lands on the person's own page -- the shell's, the same one every kind of thing gets.
  await expect(page).toHaveURL(new RegExp('/people/[0-9a-f-]{36}$'))
  await expect(page.getByRole('dialog', { name: 'People' })).toContainText('新来的')
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
  await page.goto('/people/birthdays')
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
  await page.goto('/people/birthdays')
  const coming = page.getByRole('region', { name: 'Coming up' })
  const byMonth = page.getByRole('region', { name: 'By month' })
  const [list, index] = await Promise.all([coming.boundingBox(), byMonth.boundingBox()])
  expect(list).not.toBeNull()
  expect(index).not.toBeNull()
  // The index is BESIDE the list, not under it, and the list is the wider of the two.
  expect(index!.x).toBeGreaterThan(list!.x + list!.width - 4)
  expect(list!.width).toBeGreaterThan(index!.width * 1.5)
})

test('People 页上的 Birthdays 一栏数的是未来一周', async ({ page }) => {
  // Birthdays is a view of people, so it is a tab on their page and not a row in the rail.
  await registerFreshUser(page)
  await person(page, '今天的', { calendar: 'solar', year: 1990, ...monthDay(0) })
  await person(page, '很久以后的', { calendar: 'solar', year: 1990, ...monthDay(60) })
  await page.goto('/people')
  const views = page.getByRole('navigation', { name: 'People views' })
  await expect(views.getByRole('link', { name: 'All people' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  const tab = views.getByRole('link', { name: /Birthdays/ })
  await expect(tab.locator('[data-count]')).toHaveText('1')
  await tab.click()
  await expect(page).toHaveURL(/\/people\/birthdays$/)
  await expect(tab).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { level: 1, name: 'People' })).toBeVisible()
})

test('the Birthdays tab count follows a birthday set in the pane', async ({ page }) => {
  await registerFreshUser(page)
  await person(page, 'Already counted', { calendar: 'solar', year: 1990, ...monthDay(1) })
  const id = await person(page, 'Born Soon')
  await page.goto(`/people/${id}`)
  const tab = page
    .getByRole('navigation', { name: 'People views' })
    .getByRole('link', { name: /Birthdays/ })
  await expect(tab.locator('[data-count]')).toHaveText('1')

  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Birthday, not set' }).click()
  const { month, day } = monthDay(2)
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August']
  const months = [...MONTHS, 'September', 'October', 'November', 'December']
  await pickOne(page, 'Month', new RegExp(`^${months[month - 1]}$`))
  await pickOne(page, 'Day', new RegExp(`^${day}$`))
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(tab.locator('[data-count]')).toHaveText('2')
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
  await page.goto(`/people/${id}`)
  const glance = page.getByRole('dialog', { name: 'People' })
  // 页面上只有日期本身：农历、生肖、星座、时辰、下一次都是第二层的东西。
  await expect(glance).toContainText('农历辛未年九月初三')
  await expect(glance).not.toContainText('turns')
  await expect(glance.locator('[data-birthday-chip]')).toHaveCount(0)

  await glance.getByRole('button', { name: /^Birthday,/ }).click()
  const more = glance.locator('[data-birthday-more]')
  await expect(more).toContainText('午时')
  await expect(more).toContainText('羊')
  await expect(more).toContainText('天秤')
  await expect(more).toContainText('turns')
  // 派生值不是输入框：没有一个控件的无障碍名叫 Zodiac 或 Sign。
  await expect(glance.getByRole('button', { name: /Zodiac|Sign/ })).toHaveCount(0)
})

test('写一个农历生日，输入时就看见换算与回退', async ({ page }) => {
  await registerFreshUser(page)
  const id = await person(page, '外婆')
  await page.goto(`/people/${id}`)
  // 改生日和改别的字段同一条路：一个 Edit 进表，生日那一格点开是那排控件。
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Birthday, not set' }).click()
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
  // The solar day in the app's own words, never the wire format.
  await expect(preview).toContainText('Feb 12, 1945')
  await expect(preview).toContainText('猴')
  await expect(preview).toContainText('has 29 days')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog', { name: 'People' })).toContainText('农历甲申年十二月三十')
})

test('选了那一年没有的日子，预览就说是哪一条不成立', async ({ page }) => {
  await registerFreshUser(page)
  const id = await person(page, '赵姨')
  await page.goto(`/people/${id}`)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Birthday, not set' }).click()
  await page
    .getByRole('group', { name: 'Which calendar' })
    .getByRole('button', { name: 'Lunar' })
    .click()
  // 2021 年的正月只有 29 天：月、日、年各自都合法，凑起来这一天没发生过。
  await page.getByRole('textbox', { name: 'Year' }).fill('2021')
  await pickOne(page, 'Lunar month', '正月')
  await pickOne(page, 'Lunar day', '三十')
  await expect(page.getByTestId('birthday-preview')).toContainText(
    '正月 has 29 days in 2021, so there is no 三十.',
  )
  // 服务端会拒，而保存这条路径不画错误 -- 按下去只会让输入无声消失。
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
  await pickOne(page, 'Lunar day', '廿九')
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled()
})

test('联系人列表能按 circle 筛，而且不默认藏人', async ({ page }) => {
  await registerFreshUser(page)
  await person(page, '妈妈', undefined, 'family')
  await person(page, '同事老张', undefined, 'work')
  await page.goto('/people')
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
  await page.goto(`/people/${id}`)
  const glance = page.getByRole('dialog', { name: 'People' })
  await expect(glance).toContainText('农历九月初三')
  await glance.getByRole('button', { name: /^Birthday,/ }).click()
  await expect(glance.locator('[data-birthday-chip]')).toHaveCount(0)
})

test('知道年份的人，生肖与星座各一个 chip', async ({ page }) => {
  await registerFreshUser(page)
  const id = await person(page, '周楠', { calendar: 'lunar', year: 1991, month: 9, day: 3 })
  await page.goto(`/people/${id}`)
  const glance = page.getByRole('dialog', { name: 'People' })
  await glance.getByRole('button', { name: /^Birthday,/ }).click()
  await expect(glance.locator('[data-birthday-chip]')).toHaveCount(2)
})

test('公历但不知年份：有星座，没有生肖，所以只有一个 chip', async ({ page }) => {
  await registerFreshUser(page)
  // 这一条是两个 chip 各自的守卫唯一管用的地方：两个都空时外层就不画了。
  const id = await person(page, '蒋老师', { calendar: 'solar', month: 11, day: 2 })
  await page.goto(`/people/${id}`)
  const glance = page.getByRole('dialog', { name: 'People' })
  await glance.getByRole('button', { name: /^Birthday,/ }).click()
  const chips = glance.locator('[data-birthday-chip]')
  await expect(chips).toHaveCount(1)
  await expect(chips).toHaveText('天蝎')
})

test('一个人的备注是 Markdown，和任务备注同一条管线', async ({ page }) => {
  await registerFreshUser(page)
  const id = await person(page, '周楠')
  await page.request.patch(`/api/v1/people/${id}`, {
    headers: WEB,
    data: {
      note: [
        '一起做过毕设。喝不了酒，爱喝**冷萃**。',
        '',
        '### 怎么认识的',
        '',
        '- 2018 年同一个实验室',
        '- 聊到 `pg_trgm`',
      ].join('\n'),
    },
  })
  await page.goto(`/people/${id}`)
  const notes = page.locator('[data-person-notes]')
  // 等渲染器到场：fallback 是备注原文的纯文本，断言在它上面会测到错的那一帧（notes.spec.ts 栽过）。
  await expect(notes.locator('[data-note-md]')).toBeVisible()
  await expect(notes.locator('strong')).toHaveText('冷萃')
  await expect(notes.locator('h3')).toHaveText('怎么认识的')
  await expect(notes.locator('li')).toHaveCount(2)
  await expect(notes.locator('code')).toHaveText('pg_trgm')
})

test('备注在写作模式里改，关掉就落库', async ({ page }) => {
  await registerFreshUser(page)
  const id = await person(page, '周楠')
  await page.goto(`/people/${id}`)
  // 改备注不必先进整张表：阅读态里它自己有一个入口。
  await page.getByRole('button', { name: 'Edit notes' }).click()
  // The writing layer is driven the way `notes.spec.ts` drives it: its textarea is labelled
  // `Markdown source`, and Escape is how it closes everywhere in this app.
  await page.getByLabel('Markdown source').fill('# 标题\n\n正文一行')
  await page.keyboard.press('Escape')
  const notes = page.locator('[data-person-notes]')
  await expect(notes.locator('[data-note-md]')).toBeVisible()
  await expect(notes.locator('h1')).toHaveText('标题')
})

test('工作台上有一张卡，没人要提醒时说下一个是谁', async ({ page }) => {
  await registerFreshUser(page)
  await person(page, '很久以后的', { calendar: 'solar', year: 1990, ...monthDay(60) })
  await page.goto('/')
  const card = page.getByRole('region', { name: 'Birthdays' })
  await expect(card).toContainText('Nobody to greet yet')
  await expect(card).toContainText('很久以后的 is next, in 60 days')

  await person(page, '今天的', { calendar: 'solar', year: 1993, ...monthDay(0) })
  await page.reload()
  await expect(card.locator('[data-birthday-row]')).toHaveCount(1)
  await expect(card).toContainText('today')
  await card.getByRole('heading').getByRole('link').click()
  await expect(page).toHaveURL(/\/people\/birthdays$/)
  await expect(page.getByRole('heading', { level: 1, name: 'People' })).toBeVisible()
})

test('卡片空着时说的是没人要提醒，不是一周之内没人', async ({ page }) => {
  await registerFreshUser(page)
  // 三天后生日、只要当天提醒：这个人在一周之内，卡片上却不该有他。
  await person(page, '只要当天的', {
    calendar: 'solar',
    year: 1990,
    ...monthDay(3),
    remindLead: 0,
  })
  await page.goto('/')
  const card = page.getByRole('region', { name: 'Birthdays' })
  await expect(card.locator('[data-birthday-row]')).toHaveCount(0)
  await expect(card).toContainText('Nobody to greet yet')
  await expect(card).toContainText('只要当天的 is next, in 3 days')
  await expect(card).not.toContainText('next week')
})

test('提前量决定谁上卡片：只要当天的人，五天前不出现', async ({ page }) => {
  await registerFreshUser(page)
  await person(page, '要一周的', {
    calendar: 'solar',
    year: 1990,
    ...monthDay(5),
    remindLead: 7,
  })
  await person(page, '只要当天的', {
    calendar: 'solar',
    year: 1990,
    ...monthDay(5),
    remindLead: 0,
  })
  await page.goto('/')
  const card = page.getByRole('region', { name: 'Birthdays' })
  await expect(card).toContainText('要一周的')
  await expect(card).not.toContainText('只要当天的')
  // 两个人都在那一页上：卡片是「会找上你的」，不是「全部」。
  await page.goto('/people/birthdays')
  await expect(page.locator('[data-birthday-row]')).toHaveCount(2)
})

test('People and Birthdays share one page head', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const head = async () => {
    const make = page.getByRole('main').getByRole('button', { name: 'New person', exact: true })
    await expect(make).toBeVisible()
    return {
      box: await make.boundingBox(),
      fill: await make.evaluate((el) => getComputedStyle(el).backgroundColor),
    }
  }
  const onPeople = await head()
  await page
    .getByRole('navigation', { name: 'People views' })
    .getByRole('link', { name: /Birthdays/ })
    .click()
  await expect(page).toHaveURL(/\/people\/birthdays$/)
  // The view has drawn, so the head being measured is this view's and not the one leaving.
  await expect(page.getByRole('searchbox', { name: 'Find a person' })).toBeVisible()
  expect(await head()).toEqual(onPeople)
  // What only this view has sits in the view, under its tabs, not in the head they share.
  const views = (await page.getByRole('navigation', { name: 'People views' }).boundingBox())!
  const find = (await page.getByRole('searchbox', { name: 'Find a person' }).boundingBox())!
  expect(find.y).toBeGreaterThanOrEqual(views.y + views.height)
})
