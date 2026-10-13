import { expect, test } from '@playwright/test'
import { registerFreshUser, submitCreate } from './helpers'

test('capture from any page lands in the inbox', async ({ page }) => {
  await registerFreshUser(page)

  // Captured from the today page, with no project chosen: that is the whole point.
  await submitCreate(page, 'Capture…', '问问房东空调')
  // The box clears, so the next thing can be typed without reaching for the mouse.
  await expect(page.getByPlaceholder('Capture…')).toHaveValue('')

  // Asserted through the API, not the project page: the task tree does not exist until Task 8.
  // `page.request` shares the page's cookies, so this is the logged-in user's own inbox.
  const projects = await (await page.request.get('/api/v1/projects')).json()
  const inbox = projects.projects.find((p: { isInbox: boolean }) => p.isInbox)
  const tasks = await (await page.request.get(`/api/v1/tasks?projectId=${inbox.id}`)).json()
  expect(tasks.tasks.map((t: { title: string }) => t.title)).toContain('问问房东空调')
})

test('the inbox sorts first, and is the one project with nothing to delete it with', async ({
  page,
}) => {
  await registerFreshUser(page)
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Projects' })
    .click()
  await submitCreate(page, 'New project', 'aaa')

  const items = page.getByRole('listitem')
  await expect(items.first()).toHaveText(/Inbox/)
  // No row carries it: the list is a place you aim at names.
  await expect(items.getByRole('button', { name: 'Delete' })).toHaveCount(0)

  // It is at the foot of the project's own page -- for an ordinary project. The inbox has none,
  // because capture has to land somewhere. The UI hides it; the server refuses it too (Task 2).
  // Both, because a UI is not a constraint.
  await items.filter({ hasText: 'aaa' }).getByRole('link').click()
  await expect(page.getByRole('button', { name: 'Delete project' })).toHaveCount(1)
  await page.goBack()
  await items.first().getByRole('link').click()
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete project' })).toHaveCount(0)
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
        body: JSON.stringify({ name: 'Inbox' }),
      }).then((r) => r.status),
    [inbox.id],
  )
  // If the rename silently failed the inbox would still be called Inbox and this test would
  // degrade into the plain capture test, which a name-matching inboxOf also passes.
  expect(patched).toBe(200)
  const after = await (await page.request.get('/api/v1/projects')).json()
  expect(after.projects.find((p: { id: string }) => p.id === inbox.id).name).toBe('Inbox')
  await page.reload()
  await submitCreate(page, 'Capture…', '改名后仍然能捕获')
  // The box clears only once the server has accepted the task; without this wait the API read
  // below could race the request.
  await expect(page.getByPlaceholder('Capture…')).toHaveValue('')
  // Again through the API: the tree lands in Task 8.
  const tasks = await (await page.request.get(`/api/v1/tasks?projectId=${inbox.id}`)).json()
  expect(tasks.tasks.map((t: { title: string }) => t.title)).toContain('改名后仍然能捕获')
})

test('a blank line is not sent', async ({ page }) => {
  await registerFreshUser(page)
  const posts: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/v1/tasks')) posts.push(r.url())
  })
  const box = page.getByPlaceholder('Capture…')
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
  await expect(page.getByPlaceholder('Capture…')).toBeDisabled()
  await expect(page.getByRole('alert')).toContainText('No inbox to capture into')
})

test('a failed project fetch tells the capture box user why it is disabled', async ({ page }) => {
  await registerFreshUser(page)
  await page.route('**/api/v1/projects', (route) => route.fulfill({ status: 500, json: {} }))
  await page.reload()
  await expect(page.getByPlaceholder('Capture…')).toBeDisabled()
  await expect(page.getByRole('status')).toContainText('Inbox unavailable')
})

test('a project is deleted from its own page, and the list loses it', async ({ page }) => {
  await registerFreshUser(page)
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Projects' })
    .click()
  await submitCreate(page, 'New project', '待删除')
  const doomed = page.getByRole('listitem').filter({ hasText: '待删除' })
  await expect(doomed).toHaveCount(1)

  await doomed.getByRole('link').click()
  await page.getByRole('button', { name: 'Delete project' }).click()
  // The first press only asks; the confirmation is the step that actually deletes.
  await page.getByRole('button', { name: 'Confirm delete' }).click()

  // The page it was on is gone, so it ends on the list, which no longer has it.
  await expect(page).toHaveURL(/\/projects$/)
  await expect(doomed).toHaveCount(0)
  // Gone on the server too, not just hidden by the client cache.
  const list = await (await page.request.get('/api/v1/projects')).json()
  expect(list.projects.map((p: { name: string }) => p.name)).not.toContain('待删除')
})
