import { expect, test } from '@playwright/test'
import {
  registerFreshUser,
  serverTasks,
  slowReads,
  submitCreate,
  captureBox,
  navLink,
  openCapture,
} from './helpers'

test('capture from any page lands in the inbox', async ({ page }) => {
  await registerFreshUser(page)

  // Captured from the today page, with no project chosen: that is the whole point.
  await submitCreate(page, 'Capture…', '问问房东空调')
  // The box cleared for the next line before it closed (`submitCreate` waits for that).

  // Asserted through the API, not the project page: the task tree does not exist until Task 8.
  // `page.request` shares the page's cookies, so this is the logged-in user's own inbox.
  const projects = await (await page.request.get('/api/v1/projects')).json()
  const inbox = projects.projects.find((p: { isInbox: boolean }) => p.isInbox)
  const tasks = await serverTasks(page, inbox.id)
  expect(tasks.map((t: { title: string }) => t.title)).toContain('问问房东空调')
})

test('the inbox sorts first, and is the one project with nothing to delete it with', async ({
  page,
}) => {
  await registerFreshUser(page)
  await navLink(page, 'Projects').click()
  await submitCreate(page, 'New project', 'aaa')

  const items = page.getByRole('listitem')
  await expect(items.first()).toHaveText(/Inbox/)
  // No row carries it: the list is a place you aim at names.
  await expect(items.getByRole('button', { name: 'Delete' })).toHaveCount(0)

  // It is at the foot of the project's own page -- for an ordinary project. The inbox has none,
  // because capture has to land somewhere. The UI hides it; the server refuses it too (Task 2).
  // Both, because a UI is not a constraint.
  await items.filter({ hasText: 'aaa' }).getByRole('link').click()
  await expect(page.getByRole('button', { name: /^Delete / })).toHaveCount(1)
  await page.goBack()
  await items.first().getByRole('link').click()
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Delete / })).toHaveCount(0)
})

test('capture still finds the inbox after it is renamed', async ({ page }) => {
  await registerFreshUser(page)
  // Rename through the API.
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
  // Again through the API: the tree lands in Task 8.
  const tasks = await serverTasks(page, inbox.id)
  expect(tasks.map((t: { title: string }) => t.title)).toContain('改名后仍然能捕获')
})

test('a blank line is not sent', async ({ page }) => {
  await registerFreshUser(page)
  const posts: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/v1/tasks')) posts.push(r.url())
  })
  const box = await openCapture(page)
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
  await page.route('**/api/v1/projects', (route) =>
    route.fulfill({ json: { projects: [], page: { limit: 200, nextCursor: null } } }),
  )
  await page.reload()
  await openCapture(page)
  await expect(captureBox(page)).toBeDisabled()
  await expect(page.getByRole('alert')).toContainText('No inbox to capture into')
})

test('a failed project fetch tells the capture box user why it is disabled', async ({ page }) => {
  await registerFreshUser(page)
  await page.route('**/api/v1/projects', (route) => route.fulfill({ status: 500, json: {} }))
  await page.reload()
  await openCapture(page)
  await expect(captureBox(page)).toBeDisabled()
  await expect(page.getByRole('status')).toContainText('Inbox unavailable')
})

test('a project is deleted from its own page, and the list loses it', async ({ page }) => {
  await registerFreshUser(page)
  await navLink(page, 'Projects').click()
  await submitCreate(page, 'New project', '待删除')
  const doomed = page.getByRole('listitem').filter({ hasText: '待删除' })
  await expect(doomed).toHaveCount(1)

  await doomed.getByRole('link').click()
  await page.getByRole('button', { name: /^Delete / }).click()
  // The first press only asks; the confirmation is the step that actually deletes.
  await page.getByRole('button', { name: /^Delete/ }).click()

  // The page it was on is gone, so it ends on the list, which no longer has it.
  await expect(page).toHaveURL(/\/projects$/)
  await expect(doomed).toHaveCount(0)
  // Gone on the server too, not just hidden by the client cache.
  const list = await (await page.request.get('/api/v1/projects')).json()
  expect(list.projects.map((p: { name: string }) => p.name)).not.toContain('待删除')
})

test('the capture box is empty for the next line once the server has the last', async ({
  page,
}) => {
  await registerFreshUser(page)
  // On the inbox's own page, whose list is read again after every capture.
  const { projects } = await (await page.request.get('/api/v1/projects')).json()
  await page.goto(`/projects/${projects.find((p: { isInbox: boolean }) => p.isInbox).id}`)
  const box = await openCapture(page)
  await expect(box).toBeEnabled()
  // The inbox read after the save is slow; the box must not wait for it.
  await slowReads(page, '**/api/v1/tasks?projectId=*')
  const posted = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/tasks',
  )
  await box.fill('first line')
  await box.press('Enter')
  await posted
  await box.pressSequentially('second', { delay: 20 })
  await expect(box).toHaveValue('second')
})
