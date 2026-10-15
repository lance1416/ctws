import { expect, test, type Page } from '@playwright/test'
import { dayOffset } from './days'
import { pickOne, registerFreshUser, WEB } from './helpers'

/**
 * Birthdays: the lens over the people who have one.
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
 * A birthday's row is a person's row: the day in the margin with the cake, the thread, then who,
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

  // The margin says the server's day, as a month and a day, beside the cake.
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

test('Coming up holds the next seven days, Later the rest, nobody twice', async ({ page }) => {
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

test('a lunar birthday lands on its own day and is shown as a lunar date', async ({ page }) => {
  await registerFreshUser(page)
  // Lunar 9/3 of 1991 was solar 1991-10-10, but it recurs by the lunar calendar.
  await person(page, '周楠', { calendar: 'lunar', year: 1991, month: 9, day: 3 })
  await page.goto('/people/birthdays')
  const row = rows(page).filter({ hasText: '周楠' })
  await expect(row).toContainText('农历九月初三')
  await expect(row).toContainText('turns')
})

test('the month index is the date search: a month shows only its people', async ({ page }) => {
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

/** The head's counts are of the people on screen, not of everyone stored. */
test("the head's count follows the filter", async ({ page }) => {
  await registerFreshUser(page)
  // Two and five months from today, in different months, so neither is ever in the next week.
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

  // The search box is the same filter, so the count follows it too.
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

test('the name search filters as you type', async ({ page }) => {
  await registerFreshUser(page)
  await person(page, '周楠', { calendar: 'solar', year: 1991, ...monthDay(1) })
  await person(page, 'Priya Raman', { calendar: 'solar', year: 1988, ...monthDay(2) })
  await page.goto('/people/birthdays')
  await page.getByRole('searchbox', { name: 'Find a person' }).fill('priya')
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page)).toContainText('Priya Raman')
})

test("a person written down here uses People's own dialog", async ({ page }) => {
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

test('the page has no horizontal scroll at 375px', async ({ page }) => {
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

test('at 1440px the list spans two columns and the index takes the third', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await registerFreshUser(page)
  await person(page, '王颖', { calendar: 'solar', year: 1993, ...monthDay(0) })
  await page.goto('/people/birthdays')
  const coming = page.getByRole('region', { name: 'Coming up' })
  const byMonth = page.getByRole('region', { name: 'By month' })
  const [list, index] = await Promise.all([coming.boundingBox(), byMonth.boundingBox()])
  expect(list).not.toBeNull()
  expect(index).not.toBeNull()
  // The index is beside the list, not under it, and the list is the wider of the two.
  expect(index!.x).toBeGreaterThan(list!.x + list!.width - 4)
  expect(list!.width).toBeGreaterThan(index!.width * 1.5)
})

test('the Birthdays tab on People counts the coming week', async ({ page }) => {
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

test('derived birthday details are read-only, edited in one place', async ({ page }) => {
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
  // At a glance only the date; the zodiac, sign, hour and next birthday are one level down.
  await expect(glance).toContainText('农历辛未年九月初三')
  await expect(glance).not.toContainText('turns')
  await expect(glance.locator('[data-birthday-chip]')).toHaveCount(0)

  await glance.getByRole('button', { name: /^Birthday,/ }).click()
  const more = glance.locator('[data-birthday-more]')
  await expect(more).toContainText('午时')
  await expect(more).toContainText('羊')
  await expect(more).toContainText('天秤')
  await expect(more).toContainText('turns')
  // Derived values are not inputs: no control is named Zodiac or Sign.
  await expect(glance.getByRole('button', { name: /Zodiac|Sign/ })).toHaveCount(0)
})

test('a lunar birthday shows its conversion and fallback as it is written', async ({ page }) => {
  await registerFreshUser(page)
  const id = await person(page, '外婆')
  await page.goto(`/people/${id}`)
  // Edited like any other field: Edit opens the form, and the birthday cell opens its controls.
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
  // The server computes the preview, so this waits on a response, not a local string.
  const preview = page.getByTestId('birthday-preview')
  // The solar day in the app's own words, never the wire format.
  await expect(preview).toContainText('Feb 12, 1945')
  await expect(preview).toContainText('猴')
  await expect(preview).toContainText('has 29 days')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog', { name: 'People' })).toContainText('农历甲申年十二月三十')
})

test('a day that year does not have makes the preview say which part fails', async ({ page }) => {
  await registerFreshUser(page)
  const id = await person(page, '赵姨')
  await page.goto(`/people/${id}`)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Birthday, not set' }).click()
  await page
    .getByRole('group', { name: 'Which calendar' })
    .getByRole('button', { name: 'Lunar' })
    .click()
  // The first lunar month of 2021 has 29 days: each part is valid, but the day never happened.
  await page.getByRole('textbox', { name: 'Year' }).fill('2021')
  await pickOne(page, 'Lunar month', '正月')
  await pickOne(page, 'Lunar day', '三十')
  await expect(page.getByTestId('birthday-preview')).toContainText(
    '正月 has 29 days in 2021, so there is no 三十.',
  )
  // The server would refuse it, so Save is disabled.
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
  await pickOne(page, 'Lunar day', '廿九')
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled()
})

test('the people list filters by circle, and hides nobody by default', async ({ page }) => {
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

test('a lunar birthday without a year draws no chips', async ({ page }) => {
  await registerFreshUser(page)
  // A lunar day falls on a different solar day each year, so there is no one sign, and the zodiac
  // needs a year.
  const id = await person(page, '蒋老师', { calendar: 'lunar', month: 9, day: 3 })
  await page.goto(`/people/${id}`)
  const glance = page.getByRole('dialog', { name: 'People' })
  await expect(glance).toContainText('农历九月初三')
  await glance.getByRole('button', { name: /^Birthday,/ }).click()
  await expect(glance.locator('[data-birthday-chip]')).toHaveCount(0)
})

test('with a year, the zodiac and the sign get a chip each', async ({ page }) => {
  await registerFreshUser(page)
  const id = await person(page, '周楠', { calendar: 'lunar', year: 1991, month: 9, day: 3 })
  await page.goto(`/people/${id}`)
  const glance = page.getByRole('dialog', { name: 'People' })
  await glance.getByRole('button', { name: /^Birthday,/ }).click()
  await expect(glance.locator('[data-birthday-chip]')).toHaveCount(2)
})

test('a solar birthday without a year has a sign but no zodiac, so one chip', async ({ page }) => {
  await registerFreshUser(page)
  // The only case that exercises each chip's own guard: with both empty the block is not drawn.
  const id = await person(page, '蒋老师', { calendar: 'solar', month: 11, day: 2 })
  await page.goto(`/people/${id}`)
  const glance = page.getByRole('dialog', { name: 'People' })
  await glance.getByRole('button', { name: /^Birthday,/ }).click()
  const chips = glance.locator('[data-birthday-chip]')
  await expect(chips).toHaveCount(1)
  await expect(chips).toHaveText('天蝎')
})

test("a person's notes are Markdown, through the same pipeline as task notes", async ({ page }) => {
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
  // Wait for the renderer: the fallback is the raw text, and asserting on it tests the wrong frame.
  await expect(notes.locator('[data-note-md]')).toBeVisible()
  await expect(notes.locator('strong')).toHaveText('冷萃')
  await expect(notes.locator('h3')).toHaveText('怎么认识的')
  await expect(notes.locator('li')).toHaveCount(2)
  await expect(notes.locator('code')).toHaveText('pg_trgm')
})

test('notes are edited in the writing layer and saved when it closes', async ({ page }) => {
  await registerFreshUser(page)
  const id = await person(page, '周楠')
  await page.goto(`/people/${id}`)
  // Notes have their own way in while reading, without opening the whole form.
  await page.getByRole('button', { name: 'Edit notes' }).click()
  // The writing layer is driven the way `notes.spec.ts` drives it: its textarea is labelled
  // `Markdown source`, and Escape is how it closes everywhere in this app.
  await page.getByLabel('Markdown source').fill('# 标题\n\n正文一行')
  await page.keyboard.press('Escape')
  const notes = page.locator('[data-person-notes]')
  await expect(notes.locator('[data-note-md]')).toBeVisible()
  await expect(notes.locator('h1')).toHaveText('标题')
})

test('the workbench card says who is next when nobody needs greeting', async ({ page }) => {
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

test('an empty card says nobody to greet, not that nobody is in the week', async ({ page }) => {
  await registerFreshUser(page)
  // A birthday in three days with a same-day reminder: within the week, but not on the card.
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

test('a same-day reminder keeps a birthday five days out off the card', async ({ page }) => {
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
  // Both are on the Birthdays page: the card is what comes to you, not everyone.
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
