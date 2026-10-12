import { expect, test } from '@playwright/test'
import { makeProject, makeTask, registerFreshUser } from './helpers'

/**
 * The empty states (redesign stage 3). Four screens that used to say nothing, or a single grey
 * line: Today with nothing on it, a project with no tasks, Done with no history, a search with
 * no match. Each now says what the screen is for and offers the one action that fills it.
 *
 * The trap these guards are written against: an empty-state test that passes with data present
 * proves nothing at all. So every one of them asserts the state in its OWN emptiness condition
 * AND asserts it is gone the moment the screen has something on it -- the second half is what
 * makes the first half mean anything.
 */

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

test('an empty Today is one line, and goes when there is something on it', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')

  await expect(page.getByText('Nothing for today')).toBeVisible()
  // ONE LINE AND NO BUTTON. The second line used to explain what the page was for and a button
  // offered to go and find something -- a manual and a filler CTA, on the screen of the one
  // person who built it. An empty Today has no single obvious next step.
  await expect(page.getByRole('link', { name: '去挑一件来做' })).toHaveCount(0)
  await expect(page.getByText('都会落到这一页')).toHaveCount(0)

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
  // THIS one keeps its action, because here there IS a single obvious next step and it is the
  // input already on the page -- the button hands over the cursor rather than adding a second
  // way to create a task.
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

test('an empty Done is one line too', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await page.goto('/completed')

  await expect(page.getByText('Nothing finished yet')).toBeVisible()
  // A "back to this month" link would point at a destination the rail already carries.
  await expect(page.getByRole('link', { name: 'Back to this month' })).toHaveCount(0)

  await makeTask(page, pid, '做完的事', { status: 'done' })
  await page.goto('/completed')
  await expect(page.getByText('做完的事')).toBeVisible()
  await expect(page.getByText('Nothing finished yet')).toHaveCount(0)
})

test('a search with no match says what search covers and clears itself', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '找得到的任务')
  await page.goto('/tasks/today')
  await page.getByRole('heading', { level: 1, name: 'Today' }).waitFor()

  await page.keyboard.press('f')
  const box = page.getByRole('combobox', { name: 'Search' })
  await expect(box).toBeFocused()

  // A query that really has no match.
  const missed = page.waitForResponse((r) => r.url().includes('/api/v1/tasks/search?q=') && r.ok())
  await box.fill('绝不存在的词')
  await missed
  // One line: search now covers places and every searchable kind, so it does not say "tasks".
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
