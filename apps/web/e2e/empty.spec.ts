import { expect, test, type Page } from '@playwright/test'
import { registerFreshUser } from './helpers'

/**
 * The empty states (redesign stage 3). Four screens that used to say nothing, or a single grey
 * line: 今天 with nothing on it, a project with no tasks, 已完成 with no history, a search with
 * no match. Each now says what the screen is for and offers the one action that fills it.
 *
 * The trap these guards are written against: an empty-state test that passes with data present
 * proves nothing at all. So every one of them asserts the state in its OWN emptiness condition
 * AND asserts it is gone the moment the screen has something on it -- the second half is what
 * makes the first half mean anything.
 */

const HEADERS = { 'x-ctws-client': 'web' }

async function makeProject(page: Page, name: string): Promise<string> {
  const res = await page.request.post('/api/v1/projects', { headers: HEADERS, data: { name } })
  expect(res.ok()).toBeTruthy()
  return ((await res.json()) as { id: string }).id
}

async function makeTask(
  page: Page,
  projectId: string,
  title: string,
  patch: Record<string, unknown> = {},
): Promise<string> {
  const res = await page.request.post('/api/v1/tasks', {
    headers: HEADERS,
    data: { projectId, title, parentId: null },
  })
  expect(res.ok()).toBeTruthy()
  const id = ((await res.json()) as { id: string }).id
  if (Object.keys(patch).length > 0) {
    const p = await page.request.patch(`/api/v1/tasks/${id}`, { headers: HEADERS, data: patch })
    expect(p.ok()).toBeTruthy()
  }
  return id
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

test('an empty 今天 is one line, and goes when there is something on it', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')

  await expect(page.getByText('今天没有要做的事')).toBeVisible()
  // ONE LINE AND NO BUTTON. The second line used to explain what the page was for and a button
  // offered to go and find something -- a manual and a filler CTA, on the screen of the one
  // person who built it. An empty 今天 has no single obvious next step.
  await expect(page.getByRole('link', { name: '去挑一件来做' })).toHaveCount(0)
  await expect(page.getByText('都会落到这一页')).toHaveCount(0)

  // The other half: with something on today, none of it is on the page.
  await makeTask(page, pid, '今天要做的', { scheduledOn: ymd(new Date()) })
  await page.goto('/')
  await expect(
    page.getByRole('region', { name: '今天', exact: true }).getByText('今天要做的'),
  ).toBeVisible()
  await expect(page.getByText('今天没有要做的事')).toHaveCount(0)
})

test('an empty project says what the tree is for and puts the cursor in the input', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '新开的项目')
  await page.goto(`/projects/${pid}`)

  await expect(page.getByText('这个项目还没有任务')).toBeVisible()
  // THIS one keeps its action, because here there IS a single obvious next step and it is the
  // input already on the page -- the button hands over the cursor rather than adding a second
  // way to create a task.
  await page.getByRole('button', { name: '写第一条任务' }).click()
  await expect(page.getByRole('textbox', { name: '新任务' })).toBeFocused()

  // Typing one task really does take the state away -- not a reload, the live list.
  const created = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.ok() && /\/api\/v1\/tasks$/.test(r.url()),
  )
  await page.keyboard.type('第一条')
  await page.keyboard.press('Enter')
  await created
  await expect(page.getByRole('listitem').filter({ hasText: '第一条' })).toBeVisible()
  await expect(page.getByText('这个项目还没有任务')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '写第一条任务' })).toHaveCount(0)
})

test('an empty 已完成 is one line too', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await page.goto('/completed')

  await expect(page.getByText('还没有完成的任务')).toBeVisible()
  // 「回到今天」 was a link back to a destination that is in the rail on the same screen.
  await expect(page.getByRole('link', { name: '回到今天' })).toHaveCount(0)

  await makeTask(page, pid, '做完的事', { status: 'done' })
  await page.goto('/completed')
  await expect(page.getByText('做完的事')).toBeVisible()
  await expect(page.getByText('还没有完成的任务')).toHaveCount(0)
})

test('a search with no match says what search covers and clears itself', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '找得到的任务')
  await page.goto('/')
  await page.getByRole('heading', { level: 1, name: '今天' }).waitFor()

  await page.keyboard.press('f')
  const box = page.getByRole('combobox', { name: '搜索' })
  await expect(box).toBeFocused()

  // A query that really has no match.
  const missed = page.waitForResponse((r) => r.url().includes('/api/v1/tasks/search?q=') && r.ok())
  await box.fill('绝不存在的词')
  await missed
  await expect(page.getByText('没有匹配的任务')).toBeVisible()
  await expect(page.getByText('搜索覆盖所有项目的标题和备注，包括已归档的项目。')).toBeVisible()
  await expect(page.locator('[data-search-result]')).toHaveCount(0)

  // The one action: empty the box and hand the cursor back, so the next word can just be typed.
  await page.getByRole('button', { name: '换个词' }).click()
  await expect(box).toHaveValue('')
  await expect(box).toBeFocused()
  await expect(page.getByText('没有匹配的任务')).toHaveCount(0)

  // The other half: with a match, none of the empty state is on screen.
  const found = page.waitForResponse((r) => r.url().includes('/api/v1/tasks/search?q=') && r.ok())
  await page.keyboard.type('找得到')
  await found
  await expect(page.locator('[data-search-result]')).toHaveCount(1)
  await expect(page.getByText('没有匹配的任务')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '换个词' })).toHaveCount(0)
})
