import { expect, test } from '@playwright/test'
import { makeProject, makeTask, registerFreshUser } from './helpers'

// An empty-state test that would also pass with data present proves nothing, so each one also
// checks the screen once it has something on it.

test('an empty project is its column names and New task, one way to add', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '新开的项目')
  await page.goto(`/projects/${pid}`)

  // The empty table says it; no sentence and no second button over it.
  await expect(page.locator('[data-tree-head]')).toBeVisible()
  await expect(page.getByText('No tasks in this project yet')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add the first task' })).toHaveCount(0)
  await page.getByRole('textbox', { name: 'New task' }).click()

  // The live list, not a reload.
  const created = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.ok() && /\/api\/v1\/tasks$/.test(r.url()),
  )
  await page.keyboard.type('第一条')
  await page.keyboard.press('Enter')
  await created
  await expect(page.getByRole('listitem').filter({ hasText: '第一条' })).toBeVisible()
})

test('a search with no match says so, and offers to make it a task', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '找得到的任务')
  await page.goto('/today')
  await page.locator('#today-heading').waitFor()

  await page.keyboard.press('Control+k')
  const box = page.getByRole('combobox', { name: 'Search' })
  await expect(box).toBeFocused()

  // A query that really has no match.
  const missed = page.waitForResponse((r) => r.url().includes('/api/v1/search?q=') && r.ok())
  await box.fill('绝不存在的词')
  await missed
  // Said on the page, and once to a screen reader by the live region beside it.
  await expect(
    page.getByText('No results match “绝不存在的词”.').and(page.locator(':not([aria-live])')),
  ).toBeVisible()
  await expect(page.locator('[aria-live="polite"]')).toHaveText('No results match “绝不存在的词”.')
  await expect(page.locator('[data-search-result]')).toHaveCount(0)

  // Enter makes it a task, in the inbox, and opens it there.
  const made = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/tasks',
  )
  await expect(page.getByRole('button', { name: /New task “绝不存在的词”/ })).toBeVisible()
  await box.press('Enter')
  expect((await made).ok()).toBe(true)
  await expect(box).toHaveCount(0)
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\?.*task=[0-9a-f-]{36}/)
  await expect(
    page.getByRole('dialog', { name: 'Task details' }).locator('[data-detail-title]'),
  ).toHaveText('绝不存在的词')
})
