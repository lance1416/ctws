import { expect, test, type Page } from '@playwright/test'
import { dayOffset } from './days'
import { lunarYear, pickLunarDay, registerFreshUser, WEB, apiPost } from './helpers'

/**
 * Birthdays: the lens over the people who have one.
 *
 * What is tested here is the page's own claims: who is in which segment, that a lunar birthday
 * lands on its own day rather than the solar date somebody was born on, that the month index is
 * the date search, and that nobody appears twice.
 */

/** Writes a person down, birthday and all. Returns their id. */
async function person(page: Page, name: string, birthday?: unknown, circle?: string) {
  const res = await apiPost(page, '/people', {
    name,
    ...(birthday ? { birthday } : {}),
    ...(circle ? { circle } : {}),
  })
  return res.id
}

/** The month and day `n` days from today, in the runner's zone -- which is the account's. */
function monthDay(offset: number): { month: number; day: number } {
  const [, m, d] = dayOffset(offset).split('-').map(Number) as [number, number, number]
  return { month: m, day: d }
}

/**
 * A birthday's row is a person's row: the day in the margin with the cake, the thread, then who,
 * how old, and how far off at the far end. The heading above hangs where the threads do.
 */

/**
 * A BIRTHDAY ON A PERSON'S PAGE (FR-061, artboard 5): the day on a tile, how far off, the lunar
 * date when it is lunar, and the age it turns or that the year is not known. What else a day means
 * (the zodiac, the sign, the hour) is in the form's preview, where the day is chosen.
 */
test('a lunar birthday reads as its day, its lunar date and the age it turns', async ({ page }) => {
  await registerFreshUser(page)
  const id = await person(page, '周楠', {
    calendar: 'lunar',
    year: 1991,
    month: 9,
    day: 3,
    hourBranch: 6,
  })
  await page.goto(`/people/${id}`)
  const day = page.getByRole('region', { name: 'Birthday' })
  await expect(day).toContainText('九月初三')
  await expect(day).toContainText(/Turns \d+/)
  // The rest of what the day means is the form's, one level down from reading.
  await expect(day).not.toContainText('羊')

  await page.goto(`/people/${id}/edit`)
  const preview = page.getByTestId('birthday-preview')
  await expect(preview).toContainText('午时')
  await expect(preview).toContainText('羊')
  await expect(preview).toContainText('天秤')
})

test('a birthday without a year says so', async ({ page }) => {
  await registerFreshUser(page)
  const id = await person(page, '蒋老师', { calendar: 'lunar', month: 9, day: 3 })
  await page.goto(`/people/${id}`)
  const day = page.getByRole('region', { name: 'Birthday' })
  await expect(day).toContainText('九月初三')
  await expect(day).toContainText('Year not known')
})

test('a lunar birthday shows its conversion and fallback as it is written', async ({ page }) => {
  await registerFreshUser(page)
  const id = await person(page, '外婆')
  await page.goto(`/people/${id}/edit`)
  // Folded until asked for.
  await page.getByRole('button', { name: 'Add a birthday' }).click()
  // The year moves the lunar grid to that year's months, through the server's conversion.
  await lunarYear(page, '1944')
  await pickLunarDay(page, '十二月', '三十')
  // The server computes the preview, so this waits on a response, not a local string.
  const preview = page.getByTestId('birthday-preview')
  // The solar day in the app's own words, never the wire format.
  await expect(preview).toContainText('Feb 12, 1945')
  await expect(preview).toContainText('猴')
  await expect(preview).toContainText('has 29 days')
  await page.getByRole('button', { name: /^Save/ }).click()
  await expect(page).toHaveURL(new RegExp(`/people/${id}$`))
  await expect(page.getByRole('region', { name: 'Birthday' })).toContainText('十二月')
})

test('a day that year does not have makes the preview say which part fails', async ({ page }) => {
  await registerFreshUser(page)
  const id = await person(page, '赵姨')
  await page.goto(`/people/${id}/edit`)
  await page.getByRole('button', { name: 'Add a birthday' }).click()
  // The grid offers only days that exist; a day can stop existing when the year changes under it.
  await lunarYear(page, '1944')
  await pickLunarDay(page, '十二月', '三十')
  await page.getByRole('textbox', { name: 'Year' }).fill('1993')
  await expect(page.getByTestId('birthday-preview')).toContainText(
    '十二月 has 29 days in 1993, so there is no 三十.',
  )
  // The server would refuse it, so Save is disabled; the year it happened in brings it back.
  const save = page.getByRole('button', { name: /^Save/ })
  await expect(save).toBeDisabled()
  await page.getByRole('textbox', { name: 'Year' }).fill('1944')
  await expect(save).toBeEnabled()
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
  const notes = page.getByRole('region', { name: 'Notes' })
  // Wait for the renderer: the fallback is the raw text, and asserting on it tests the wrong frame.
  await expect(notes.locator('[data-note-md]')).toBeVisible()
  await expect(notes.locator('strong')).toHaveText('冷萃')
  await expect(notes.locator('h3')).toHaveText('怎么认识的')
  await expect(notes.locator('li')).toHaveCount(2)
  await expect(notes.locator('code')).toHaveText('pg_trgm')
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
  // Its heading opens everyone's birthdays, in the People sidebar (FR-060).
  await card.getByRole('heading').getByRole('link').click()
  await expect(page).toHaveURL(/\/people\?list=birthdays$/)
  await expect(page.getByRole('navigation', { name: 'Birthdays' })).toBeVisible()
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
  // Both are in the birthdays list: the card is what comes to you, not everyone.
  await page.goto('/people?list=birthdays')
  await expect(
    page.getByRole('navigation', { name: 'Birthdays' }).locator('[data-birthday-row]'),
  ).toHaveCount(2)
})

/**
 * THE PEOPLE OVERVIEW'S BIRTHDAYS (FR-060): the next 30 days by date, and All N, which lists
 * everyone's in the sidebar, the nearest first. An old address to the Birthdays page lands there.
 */
test('the overview lists the next 30 days of birthdays, and All N the rest in the sidebar', async ({
  page,
}) => {
  await registerFreshUser(page)
  await person(page, '二十天后', { calendar: 'solar', year: 1990, ...monthDay(20) })
  await person(page, '三天后', { calendar: 'solar', year: 1990, ...monthDay(3) })
  await person(page, '两个月后', { calendar: 'solar', year: 1990, ...monthDay(60) })
  await person(page, '没生日的')
  await page.goto('/people')

  const block = page.getByRole('region', { name: 'Birthdays in the next 30 days' })
  await expect(block.getByRole('listitem')).toHaveText([/三天后.*3 d/, /二十天后.*20 d/])
  await block.getByRole('link', { name: 'All 3' }).click()
  await expect(page).toHaveURL(/\/people\?list=birthdays$/)
  const list = page.getByRole('navigation', { name: 'Birthdays' })
  await expect(list.locator('[data-birthday-row]')).toHaveText([/三天后/, /二十天后/, /两个月后/])
  // Back to everyone.
  await list.getByRole('link', { name: 'Show everyone' }).click()
  await expect(
    page.getByRole('navigation', { name: 'People' }).locator('[data-person-row]'),
  ).toHaveCount(4)

  await page.goto('/people/birthdays')
  await expect(page).toHaveURL(/\/people\?list=birthdays$/)
})

test('a circle on the overview narrows the sidebar to its people', async ({ page }) => {
  await registerFreshUser(page)
  const res = await page.request.put('/api/v1/people/circles', {
    headers: WEB,
    data: { circles: [{ name: 'Family' }, { name: 'Work' }] },
  })
  expect(res.ok(), await res.text()).toBe(true)
  const { circles } = (await res.json()) as { circles: { id: string; name: string }[] }
  const family = circles.find((c) => c.name === 'Family')!.id
  await apiPost(page, '/people', { name: '妈妈', circleIds: [family] })
  await apiPost(page, '/people', { name: '同事老张' })
  await page.goto('/people')

  const block = page.getByRole('region', { name: 'Circles' })
  await expect(block.getByRole('link')).toHaveText([/Family\s*1/, /Work\s*0/])
  await block.getByRole('link', { name: /Family/ }).click()
  const sidebar = page.getByRole('navigation', { name: 'People' })
  await expect(sidebar).toContainText('In Family')
  await expect(sidebar.locator('[data-person-row]')).toHaveText([/妈妈/])
  // A person opened from the narrowed list keeps it.
  await sidebar.getByRole('link', { name: /妈妈/ }).click()
  await expect(sidebar.locator('[data-person-row]')).toHaveText([/妈妈/])
  await sidebar.getByRole('link', { name: 'Show everyone' }).click()
  await expect(sidebar.locator('[data-person-row]')).toHaveCount(2)
})
