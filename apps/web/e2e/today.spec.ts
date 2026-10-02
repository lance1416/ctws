import { expect, test, type Page } from '@playwright/test'
import { openProject, registerFreshUser, submitCreate } from './helpers'

async function captureAndOpen(page: Page, title: string) {
  await submitCreate(page, '捕获…', title)
  await page.getByRole('link', { name: '项目' }).click()
  await openProject(page, 'Inbox')
  await page.getByRole('listitem').filter({ hasText: title }).click()
}

test('a freshly registered user sees an empty today page, not an error', async ({ page }) => {
  await registerFreshUser(page)
  await expect(page.getByRole('heading', { name: '今天' })).toBeVisible()
  await expect(page.getByText('今天没有安排的事')).toBeVisible()
})

test('scheduling a task through the detail panel puts it on the today page', async ({ page }) => {
  await registerFreshUser(page)
  await captureAndOpen(page, '改简历')

  // Today in the browser's own timezone, which is also the timezone registration recorded.
  const today = new Date().toLocaleDateString('en-CA')
  await page.getByLabel('排期').fill(today)
  await page.getByRole('button', { name: '保存' }).click()

  await page.getByRole('link', { name: '今天' }).click()
  const section = page.getByRole('region', { name: '今天' })
  await expect(section.getByText('改简历')).toBeVisible()
  // The breadcrumb says where it lives, so the list is usable without opening anything.
  await expect(section.getByText('Inbox')).toBeVisible()
  // With something scheduled, the empty-state line must be gone, not shown beside the list.
  await expect(page.getByText('今天没有安排的事')).toHaveCount(0)
})

test('an in-progress task appears under 正在做', async ({ page }) => {
  await registerFreshUser(page)
  await captureAndOpen(page, '写 M2b')
  await page.getByLabel('状态').selectOption('in_progress')
  await page.getByRole('button', { name: '保存' }).click()

  await page.getByRole('link', { name: '今天' }).click()
  await expect(page.getByRole('region', { name: '正在做' }).getByText('写 M2b')).toBeVisible()
})

// The segments are decided by the server precisely so this cannot happen (Review Focus 2); this
// asserts the page does not undo that by rendering a task into several sections.
test('a task that is both overdue and in progress is shown once', async ({ page }) => {
  await registerFreshUser(page)
  await captureAndOpen(page, '又逾期又在做')
  await page.getByLabel('状态').selectOption('in_progress')
  await page.getByLabel('截止').fill('2020-01-01T00:00')
  await page.getByRole('button', { name: '保存' }).click()

  await page.getByRole('link', { name: '今天' }).click()
  // Wait for the list to be on screen before counting: while the route is still switching the
  // project page's own row is in the DOM, and a count taken then passes without proving anything.
  await expect(page.getByRole('region', { name: '逾期' }).getByText('又逾期又在做')).toBeVisible()
  await expect(page.getByText('又逾期又在做')).toHaveCount(1)
})

// The order comes from TODAY_SEGMENTS in contracts, not from a second array in the page.
test('the three sections render in the order overdue, today, in progress', async ({ page }) => {
  await registerFreshUser(page)
  const today = new Date().toLocaleDateString('en-CA')

  // Created in the reverse of display order so insertion order cannot explain a pass.
  await captureAndOpen(page, '甲在做')
  await page.getByLabel('状态').selectOption('in_progress')
  await page.getByRole('button', { name: '保存' }).click()
  await page.getByRole('button', { name: '关闭' }).click()

  await submitCreate(page, '捕获…', '乙今天')
  await page.getByRole('listitem').filter({ hasText: '乙今天' }).click()
  await page.getByLabel('排期').fill(today)
  await page.getByRole('button', { name: '保存' }).click()
  await page.getByRole('button', { name: '关闭' }).click()

  await submitCreate(page, '捕获…', '丙逾期')
  await page.getByRole('listitem').filter({ hasText: '丙逾期' }).click()
  await page.getByLabel('截止').fill('2020-01-01T00:00')
  await page.getByRole('button', { name: '保存' }).click()

  await page.getByRole('link', { name: '今天' }).click()
  await expect(page.getByRole('region')).toHaveCount(3)
  const labels = await page
    .getByRole('region')
    .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))
  expect(labels).toEqual(['逾期', '今天', '正在做'])
})

test('an edit made from the today page is reflected without a reload', async ({ page }) => {
  await registerFreshUser(page)
  await captureAndOpen(page, '先在做')
  await page.getByLabel('状态').selectOption('in_progress')
  await page.getByRole('button', { name: '保存' }).click()

  await page.getByRole('link', { name: '今天' }).click()
  await page.getByRole('region', { name: '正在做' }).getByText('先在做').click()
  await page.getByLabel('状态').selectOption('done')
  await page.getByRole('button', { name: '保存' }).click()

  await expect(page.getByText('先在做')).toHaveCount(0)
  await expect(page.getByText('今天没有安排的事')).toBeVisible()
  // The panel unmounted without being closed; focus must not have fallen to <body>.
  await expect(page.locator('#today-heading')).toBeFocused()
})

// The breadcrumb is what makes the list usable without opening anything; a nested task must show
// where it sits, not only which project it is in.
test('a nested task shows both its project and its parent in the breadcrumb', async ({ page }) => {
  await registerFreshUser(page)
  await submitCreate(page, '捕获…', '父任务')
  await page.getByRole('link', { name: '项目' }).click()
  await openProject(page, 'Inbox')
  await submitCreate(page, '捕获…', '子任务')
  await expect(page.getByRole('listitem')).toHaveCount(2)

  const moved = page.waitForResponse((r) => r.url().includes('/move') && r.ok())
  await page.getByRole('button', { name: '任务：子任务' }).focus()
  await page.keyboard.press('Alt+ArrowRight')
  await moved

  await page.getByRole('listitem').filter({ hasText: '子任务' }).click()
  await page.getByLabel('状态').selectOption('in_progress')
  await page.getByRole('button', { name: '保存' }).click()

  await page.getByRole('link', { name: '今天' }).click()
  const section = page.getByRole('region', { name: '正在做' })
  await expect(section.getByText('子任务')).toBeVisible()
  await expect(section.getByText('Inbox › 父任务')).toBeVisible()
})

// A failed fetch must not read as "nothing to do": that would tell the user they are free when the
// app simply could not ask.
test('a failed fetch shows an error, not the empty-state line', async ({ page }) => {
  await page.route('**/api/v1/today', (route) =>
    route.fulfill({ status: 500, json: { title: 'boom' } }),
  )
  await registerFreshUser(page)
  await expect(page.getByRole('alert')).toHaveText('boom')
  await expect(page.getByText('今天没有安排的事')).toHaveCount(0)
})

// The overdue date is for reading, not for a form: a relative label, with the exact local time on
// hover. The datetime-local wire format ("2026-10-01T09:00") must never reach the screen.
test('an overdue task shows a relative label, not the datetime-local format', async ({ page }) => {
  await registerFreshUser(page)
  await captureAndOpen(page, '交报告')
  await page.getByLabel('截止').fill('2020-01-01T09:00')
  await page.getByRole('button', { name: '保存' }).click()

  await page.getByRole('link', { name: '今天' }).click()
  const section = page.getByRole('region', { name: '逾期' })
  const label = section.getByText(/^已逾 \d+ 天$/)
  await expect(label).toBeVisible()
  await expect(label).toHaveAttribute('title', '2020-01-01 09:00')
  await expect(section).not.toContainText(/\d{4}-\d{2}-\d{2}T/)
  await expect(section).not.toContainText('T09:00')
})

test('the status dot has a text alternative', async ({ page }) => {
  await registerFreshUser(page)
  await captureAndOpen(page, '写 M2b')
  await page.getByLabel('状态').selectOption('in_progress')
  await page.getByRole('button', { name: '保存' }).click()

  await page.getByRole('link', { name: '今天' }).click()
  await expect(
    page.getByRole('region', { name: '正在做' }).getByRole('img', { name: '进行中' }),
  ).toBeVisible()
})
