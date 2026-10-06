import { expect, test, type Page } from '@playwright/test'
import {
  editDetail,
  openProject,
  registerFreshUser,
  setDetailStatus,
  submitCreate,
} from './helpers'

async function captureAndOpen(page: Page, title: string) {
  await submitCreate(page, '捕获…', title)
  await page.getByRole('link', { name: '项目' }).click()
  await openProject(page, 'Inbox')
  await page.getByRole('listitem').filter({ hasText: title }).click()
  // The pane opens in reading mode (rows-and-reading §5); every test here is about an edit.
  await editDetail(page)
}

test('a freshly registered user sees an empty today page, not an error', async ({ page }) => {
  await registerFreshUser(page)
  // `level: 1` because 今天完成的 is a heading on this page too, and getByRole matches names by
  // substring: without it this would be ambiguous the moment anything is finished today.
  await expect(page.getByRole('heading', { level: 1, name: '今天' })).toBeVisible()
  await expect(page.getByText('今天没有要做的事')).toBeVisible()
})

test('scheduling a task through the detail panel puts it on the today page', async ({ page }) => {
  await registerFreshUser(page)
  await captureAndOpen(page, '改简历')

  // Today in the browser's own timezone, which is also the timezone registration recorded.
  const today = new Date().toLocaleDateString('en-CA')
  await page.getByLabel('排期').fill(today)
  await page.getByRole('button', { name: '保存' }).click()

  await page.getByRole('link', { name: '今天' }).click()
  // `exact` because 今天完成的 is also a region whose name contains 今天.
  const section = page.getByRole('region', { name: '今天', exact: true })
  await expect(section.getByText('改简历')).toBeVisible()
  // The breadcrumb says where it lives, so the list is usable without opening anything.
  await expect(section.getByText('Inbox')).toBeVisible()
  // With something scheduled, the empty-state line must be gone, not shown beside the list.
  await expect(page.getByText('今天没有要做的事')).toHaveCount(0)
})

test('an in-progress task appears under 正在做', async ({ page }) => {
  await registerFreshUser(page)
  await captureAndOpen(page, '写 M2b')
  await setDetailStatus(page, '进行中')
  await page.getByRole('button', { name: '保存' }).click()

  await page.getByRole('link', { name: '今天' }).click()
  await expect(page.getByRole('region', { name: '正在做' }).getByText('写 M2b')).toBeVisible()
})

// The segments are decided by the server precisely so this cannot happen (Review Focus 2); this
// asserts the page does not undo that by rendering a task into several sections.
test('a task that is both overdue and in progress is shown once', async ({ page }) => {
  await registerFreshUser(page)
  await captureAndOpen(page, '又逾期又在做')
  await setDetailStatus(page, '进行中')
  await page.getByLabel('截止').fill('2020-01-01T00:00')
  await page.getByRole('button', { name: '保存' }).click()

  await page.getByRole('link', { name: '今天' }).click()
  // Wait for the list to be on screen before counting: while the route is still switching the
  // project page's own row is in the DOM, and a count taken then passes without proving anything.
  await expect(page.getByRole('region', { name: '逾期' }).getByText('又逾期又在做')).toBeVisible()
  await expect(page.getByText('又逾期又在做')).toHaveCount(1)
})

/**
 * Since the workbench, the three segments go to three DIFFERENT panels rather than three sections
 * of one column, and the panel order is the design's (workbench spec §1) rather than anything
 * derived from a list inside the page. So this pins two things instead of one:
 *   - the panel order of the workbench itself, including the panels that are not segments; and
 *   - that each segment's task lands in its own panel AND IN NO OTHER, which is the assertion the
 *     old section-order test was really protecting (a task matching several segments rendering
 *     twice reads as "did I create this twice?").
 */
test('each segment goes to its own panel, in the workbench order, and to only one', async ({
  page,
}) => {
  await registerFreshUser(page)
  const today = new Date().toLocaleDateString('en-CA')

  // Created in the reverse of display order so insertion order cannot explain a pass.
  await captureAndOpen(page, '甲在做')
  await setDetailStatus(page, '进行中')
  await page.getByRole('button', { name: '保存' }).click()
  // Saving closes the panel by itself (it used to need a separate 关闭).
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await submitCreate(page, '捕获…', '乙今天')
  await page.getByRole('listitem').filter({ hasText: '乙今天' }).click()
  await editDetail(page)
  await page.getByLabel('排期').fill(today)
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await submitCreate(page, '捕获…', '丙逾期')
  await page.getByRole('listitem').filter({ hasText: '丙逾期' }).click()
  await editDetail(page)
  await page.getByLabel('截止').fill('2020-01-01T00:00')
  await page.getByRole('button', { name: '保存' }).click()

  await page.getByRole('link', { name: '今天' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '今天' })).toBeVisible()
  // 做到哪儿了 is in this list too: the set is the WORKBENCH's panels, not the segment list.
  // 今天完成的 is absent because nothing was finished -- a panel with nothing to say is not drawn.
  expect(
    await page.locator('[data-panel]').evaluateAll((els) => els.map((el) => el.dataset.panel)),
  ).toEqual(['正在做', '今天', '逾期', '做到哪儿了'])

  for (const [title, panel] of [
    ['甲在做', '正在做'],
    ['乙今天', '今天'],
    ['丙逾期', '逾期'],
  ] as const) {
    await expect(
      page.getByRole('region', { name: panel, exact: true }).getByText(title),
    ).toHaveCount(1)
    // And nowhere else on the page: one task, one panel.
    await expect(page.getByText(title)).toHaveCount(1)
  }
})

test('an edit made from the today page is reflected without a reload', async ({ page }) => {
  await registerFreshUser(page)
  await captureAndOpen(page, '先在做')
  await setDetailStatus(page, '进行中')
  await page.getByRole('button', { name: '保存' }).click()

  await page.getByRole('link', { name: '今天' }).click()
  await page.getByRole('region', { name: '正在做' }).getByText('先在做').click()
  await editDetail(page)
  await setDetailStatus(page, '已完成')
  await page.getByRole('button', { name: '保存' }).click()

  // It left 正在做 -- and it turned up in 今天完成的 without a reload, which is the other half of
  // the same claim now that the workbench has a panel for finished work. (A bare "the text is
  // gone from the page" would now be false, and would have been hiding this.)
  await expect(
    page.getByRole('region', { name: '正在做', exact: true }).getByText('先在做'),
  ).toHaveCount(0)
  await expect(
    page.getByRole('region', { name: '今天完成的', exact: true }).getByText('先在做'),
  ).toBeVisible()
  await expect(page.getByText('今天没有要做的事')).toBeVisible()
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
  await editDetail(page)
  await setDetailStatus(page, '进行中')
  await page.getByRole('button', { name: '保存' }).click()

  await page.getByRole('link', { name: '今天' }).click()
  const section = page.getByRole('region', { name: '正在做' })
  await expect(section.getByText('子任务')).toBeVisible()
  await expect(section.getByText('Inbox › 父任务')).toBeVisible()
})

// A failed fetch must not read as "nothing to do": that would tell the user they are free when the
// app simply could not ask.
test('a failed fetch shows an error, not the empty-state line', async ({ page }) => {
  await page.route('**/api/v1/tasks/today', (route) =>
    route.fulfill({ status: 500, json: { title: 'boom' } }),
  )
  await registerFreshUser(page)
  await expect(page.getByRole('alert')).toHaveText('boom')
  await expect(page.getByText('今天没有要做的事')).toHaveCount(0)
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
  await setDetailStatus(page, '进行中')
  await page.getByRole('button', { name: '保存' }).click()

  await page.getByRole('link', { name: '今天' }).click()
  await expect(
    page.getByRole('region', { name: '正在做' }).getByRole('img', { name: '进行中' }),
  ).toBeVisible()
})
