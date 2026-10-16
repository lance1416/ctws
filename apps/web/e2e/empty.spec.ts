import { expect, test } from '@playwright/test'
import { makeProject, makeTask, registerFreshUser } from './helpers'
import { ymd } from './days'

/**
 * The empty states: Today with nothing on it, a project with no tasks, Done with no history, a
 * search with no match.
 *
 * The trap these guards are written against: an empty-state test that passes with data present
 * proves nothing at all. So every one of them asserts the state in its OWN emptiness condition
 * AND asserts it is gone the moment the screen has something on it -- the second half is what
 * makes the first half mean anything.
 */

test('an empty Today says so, and the line goes when there is something on it', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')

  await expect(page.getByText('Nothing for today')).toBeVisible()

  // The other half: with something on today, none of it is on the page.
  await makeTask(page, pid, '今天要做的', { scheduledOn: ymd(new Date()) })
  await page.goto('/tasks/today')
  await expect(
    page.getByRole('region', { name: 'Today', exact: true }).getByText('今天要做的'),
  ).toBeVisible()
  await expect(page.getByText('Nothing for today')).toHaveCount(0)
})

test('an empty project says what the tree is for and puts the cursor in the input', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '新开的项目')
  await page.goto(`/projects/${pid}`)

  await expect(page.getByText('No tasks in this project yet')).toBeVisible()
  // The action hands the cursor to the input already on the page.
  await page.getByRole('button', { name: 'Add the first task' }).click()
  await expect(page.getByRole('textbox', { name: 'New task' })).toBeFocused()

  // Typing one task really does take the state away -- not a reload, the live list.
  const created = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.ok() && /\/api\/v1\/tasks$/.test(r.url()),
  )
  await page.keyboard.type('第一条')
  await page.keyboard.press('Enter')
  await created
  await expect(page.getByRole('listitem').filter({ hasText: '第一条' })).toBeVisible()
  await expect(page.getByText('No tasks in this project yet')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add the first task' })).toHaveCount(0)
})

test('an empty Done says so, and the line goes when something is finished', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await page.goto('/tasks/review?view=done')

  await expect(page.getByText('Nothing finished yet')).toBeVisible()

  await makeTask(page, pid, '做完的事', { status: 'done' })
  await page.goto('/tasks/review?view=done')
  await expect(page.getByText('做完的事')).toBeVisible()
  await expect(page.getByText('Nothing finished yet')).toHaveCount(0)
})

test('a search with no match says what search covers and clears itself', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '找得到的任务')
  await page.goto('/tasks/today')
  await page.locator('#today-heading').waitFor()

  await page.keyboard.press('f')
  const box = page.getByRole('combobox', { name: 'Search' })
  await expect(box).toBeFocused()

  // A query that really has no match.
  const missed = page.waitForResponse((r) => r.url().includes('/api/v1/tasks/search?q=') && r.ok())
  await box.fill('绝不存在的词')
  await missed
  await expect(page.getByText('Nothing matches')).toBeVisible()
  await expect(page.locator('[data-search-result]')).toHaveCount(0)

  // The one action: empty the box and hand the cursor back, so the next word can just be typed.
  await page.getByRole('button', { name: 'Try another word' }).click()
  await expect(box).toHaveValue('')
  await expect(box).toBeFocused()
  await expect(page.getByText('Nothing matches')).toHaveCount(0)

  // The other half: with a match, none of the empty state is on screen.
  const found = page.waitForResponse((r) => r.url().includes('/api/v1/tasks/search?q=') && r.ok())
  await page.keyboard.type('找得到')
  await found
  await expect(page.locator('[data-search-result]')).toHaveCount(1)
  await expect(page.getByText('Nothing matches')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Try another word' })).toHaveCount(0)
})
