import { expect, test } from '@playwright/test'
import { registerFreshUser, submitCreate } from './helpers'

test('capture from any page lands in the inbox', async ({ page }) => {
  await registerFreshUser(page)

  // Captured from the today page, with no project chosen: that is the whole point.
  await submitCreate(page, '捕获…', '问问房东空调')
  // The box clears, so the next thing can be typed without reaching for the mouse.
  await expect(page.getByPlaceholder('捕获…')).toHaveValue('')

  // Asserted through the API, not the project page: the task tree does not exist until Task 8.
  // `page.request` shares the page's cookies, so this is the logged-in user's own inbox.
  const projects = await (await page.request.get('/api/v1/projects')).json()
  const inbox = projects.projects.find((p: { isInbox: boolean }) => p.isInbox)
  const tasks = await (await page.request.get(`/api/v1/projects/${inbox.id}/tasks`)).json()
  expect(tasks.tasks.map((t: { title: string }) => t.title)).toContain('问问房东空调')
})

test('the inbox sorts first and offers no delete control', async ({ page }) => {
  await registerFreshUser(page)
  await page.getByRole('link', { name: '项目' }).click()
  await submitCreate(page, '新项目', 'aaa')

  const items = page.getByRole('listitem')
  await expect(items.first()).toHaveText(/Inbox/)
  // The UI hides it; the server refuses it too (Task 2). Both, because a UI is not a constraint.
  await expect(items.first().getByRole('button', { name: '删除' })).toHaveCount(0)
  await expect(items.filter({ hasText: 'aaa' }).getByRole('button', { name: '删除' })).toHaveCount(
    1,
  )
})

test('capture still finds the inbox after it is renamed', async ({ page }) => {
  await registerFreshUser(page)
  // Rename through the API: the UI has no project rename in M2b.
  const projects = await page.evaluate(() =>
    fetch('/api/v1/projects', { headers: { 'x-ctws-client': 'web' } }).then((r) => r.json()),
  )
  const inbox = projects.projects.find((p: { isInbox: boolean }) => p.isInbox)
  const patched = await page.evaluate(
    ([id]) =>
      fetch(`/api/v1/projects/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-ctws-client': 'web' },
        body: JSON.stringify({ name: '收件箱' }),
      }).then((r) => r.status),
    [inbox.id],
  )
  // If the rename silently failed the inbox would still be called Inbox and this test would
  // degrade into the plain capture test, which a name-matching inboxOf also passes.
  expect(patched).toBe(200)
  const after = await (await page.request.get('/api/v1/projects')).json()
  expect(after.projects.find((p: { id: string }) => p.id === inbox.id).name).toBe('收件箱')
  await page.reload()
  await submitCreate(page, '捕获…', '改名后仍然能捕获')
  // The box clears only once the server has accepted the task; without this wait the API read
  // below could race the request.
  await expect(page.getByPlaceholder('捕获…')).toHaveValue('')
  // Again through the API: the tree lands in Task 8.
  const tasks = await (await page.request.get(`/api/v1/projects/${inbox.id}/tasks`)).json()
  expect(tasks.tasks.map((t: { title: string }) => t.title)).toContain('改名后仍然能捕获')
})

test('a blank line is not sent', async ({ page }) => {
  await registerFreshUser(page)
  const posts: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/v1/tasks')) posts.push(r.url())
  })
  const box = page.getByPlaceholder('捕获…')
  await box.fill('   ')
  await box.press('Enter')
  // A real capture afterwards proves the first Enter was handled, so "no POST" is not just
  // "nothing happened yet".
  await box.fill('真正的一行')
  await box.press('Enter')
  await expect(box).toHaveValue('')
  expect(posts).toHaveLength(1)
})

test('without an inbox the box is disabled and says what to do', async ({ page }) => {
  await registerFreshUser(page)
  await page.route('**/api/v1/projects', (route) => route.fulfill({ json: { projects: [] } }))
  await page.reload()
  await expect(page.getByPlaceholder('捕获…')).toBeDisabled()
  await expect(page.getByRole('alert')).toContainText('没有找到收件箱')
})

test('a failed project fetch tells the capture box user why it is disabled', async ({ page }) => {
  await registerFreshUser(page)
  await page.route('**/api/v1/projects', (route) => route.fulfill({ status: 500, json: {} }))
  await page.reload()
  await expect(page.getByPlaceholder('捕获…')).toBeDisabled()
  // TanStack Query retries a failed fetch three times (~7s) before isError.
  await expect(page.getByRole('status')).toContainText('无法加载收件箱', { timeout: 15_000 })
})

test('a project can be deleted from the list', async ({ page }) => {
  await registerFreshUser(page)
  await page.getByRole('link', { name: '项目' }).click()
  await submitCreate(page, '新项目', '待删除')
  const doomed = page.getByRole('listitem').filter({ hasText: '待删除' })
  await expect(doomed).toHaveCount(1)
  await doomed.getByRole('button', { name: '删除' }).click()
  await expect(doomed).toHaveCount(0)
  // Gone on the server too, not just hidden by the client cache.
  const list = await (await page.request.get('/api/v1/projects')).json()
  expect(list.projects.map((p: { name: string }) => p.name)).not.toContain('待删除')
  // The inbox is still there and still has no delete control.
  const inbox = page.getByRole('listitem').first()
  await expect(inbox).toHaveText(/Inbox/)
  await expect(inbox.getByRole('button', { name: '删除' })).toHaveCount(0)
})
