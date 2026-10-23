import { expect, test } from '@playwright/test'
import {
  makeProject,
  newProject,
  registerFreshUser,
  serverTasks,
  slowReads,
  submitCreate,
  captureBox,
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

test('the inbox is the overview’s last card, and the one project with no delete', async ({
  page,
}) => {
  await registerFreshUser(page)
  const { projects } = await (await page.request.get('/api/v1/projects')).json()
  const inbox = projects.find((p: { isInbox: boolean }) => p.isInbox).id as string
  const aaa = await makeProject(page, 'aaa')
  await page.goto('/projects')

  // A card of its own after the projects (FR-051); the sidebar still lists it first.
  const cards = page.getByRole('list', { name: 'Projects' }).getByRole('listitem')
  await expect(cards).toHaveCount(2)
  await expect(cards.last()).toHaveText(/Inbox is empty/)
  await expect(
    page.getByRole('navigation', { name: 'Projects' }).getByRole('link').first(),
  ).toHaveText(/Inbox/)
  // No card carries it: the overview is a place you aim at names.
  await expect(cards.getByRole('button', { name: /^Delete/ })).toHaveCount(0)

  // It is at the foot of an ordinary project's edit page. The inbox has none, because capture has
  // to land somewhere; the server refuses it too.
  await page.goto(`/projects/${aaa}/edit`)
  await expect(page.getByRole('button', { name: /^Delete / })).toHaveCount(1)
  await page.goto(`/projects/${inbox}/edit`)
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Inbox')
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

test('a project is deleted from its edit page, and the overview loses it', async ({ page }) => {
  await registerFreshUser(page)
  await newProject(page, '待删除')
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Edit project' }).click()
  await page.getByRole('button', { name: /^Delete / }).click()
  // The first press only asks; the confirmation is the step that actually deletes.
  await page.getByRole('button', { name: /^Delete/ }).click()

  // The page it was on is gone, so it ends on the overview, which no longer has it.
  await expect(page).toHaveURL(/\/projects$/)
  await expect(page.getByRole('list', { name: 'Projects' })).not.toContainText('待删除')
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
