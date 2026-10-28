import { expect, test } from '@playwright/test'
import { TZDate } from '@date-fns/tz'
import {
  accountZone,
  backdateProjectActivity,
  dayInZone,
  makeProject,
  makeTask,
  registerFreshUser,
  WEB,
  openNewTask,
} from './helpers'

/**
 * THE PROJECTS OVERVIEW (FR-051, artboard 18): a card a project, saying when it last moved, how far
 * it is ("1 of 3"), what is under way, what is late and the next deadline. The archived ones are a
 * count under the cards, and their list is in the sidebar.
 */
test('a project’s card says when it moved, how far it is, and what is under way, late and next', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await registerFreshUser(page)
  const zone = await accountZone(page)
  const job = await makeProject(page, '找工作')
  const old = await makeProject(page, 'Old thing')
  // A deadline on a fixed day years out -- so its words do not depend on today -- and one two
  // days gone on the ACCOUNT's clock.
  const [y, m, d] = dayInZone(zone).split('-').map(Number) as [number, number, number]
  await makeTask(page, job, 'Mock interview', { dueAt: '2030-05-28T12:00:00Z' })
  await makeTask(page, job, 'Update the résumé', {
    status: 'in_progress',
    dueAt: new TZDate(y, m - 1, d - 2, 12, 0, 0, 0, zone).toISOString(),
  })
  await makeTask(page, job, 'Book the room', { status: 'done' })
  // In the backlog: not counted in the progress.
  await makeTask(page, job, 'Some day', { status: 'backlog' })
  const archived = await page.request.patch(`/api/v1/projects/${old}`, {
    headers: WEB,
    data: { archived: true },
  })
  expect(archived.ok(), await archived.text()).toBe(true)
  await page.goto('/projects')

  const card = page.locator(`[data-project-card="${job}"]`)
  await expect(card.getByRole('link', { name: '找工作', exact: true })).toHaveAttribute(
    'href',
    `/projects/${job}`,
  )
  await expect(card.locator('[data-project-moved]')).toHaveText('Moved today')
  await expect(card.locator('[data-project-progress]')).toHaveText('1 of 3')
  await expect(card.locator('[data-project-fact="In progress"] dd')).toHaveText('1')
  await expect(card.locator('[data-project-fact="Late"] dd')).toHaveText('1')
  await expect(card.locator('[data-project-fact="Next due"] dd')).toHaveText('May 28, 2030')

  // The archived one is not a card: it is counted under them, and listed in the sidebar on asking.
  await expect(page.locator(`[data-project-card="${old}"]`)).toHaveCount(0)
  const rail = page.getByRole('navigation', { name: 'Projects' })
  await expect(rail.getByRole('link', { name: 'Old thing' })).toHaveCount(0)
  await page.getByRole('button', { name: '1 archived project' }).click()
  await expect(rail.getByRole('button', { name: 'Archived' })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  await expect(rail.getByRole('link', { name: 'Old thing' })).toBeVisible()

  // The whole card is the way in, not only the name: a click on its middle opens the project.
  await card.click()
  await expect(page).toHaveURL(new RegExp(`/projects/${job}$`))
})

test('a project a week unchanged with work left is quiet, in amber, and after the rest', async ({
  page,
}) => {
  await registerFreshUser(page)
  const still = await makeProject(page, 'Still')
  await makeTask(page, still, 'Waiting for a reply')
  const busy = await makeProject(page, 'Busy')
  await makeTask(page, busy, 'Doing it')
  const done = await makeProject(page, 'Done with')
  await makeTask(page, done, 'Finished', { status: 'done' })
  const zone = await accountZone(page)
  backdateProjectActivity(still, 9, zone)
  // Finished, a project nobody touched for as long waits for nobody: not quiet.
  backdateProjectActivity(done, 9, zone)
  await page.goto('/projects')

  const names = page.locator('[data-project-card] a')
  // The inbox is its own card, after them all.
  await expect(names).toHaveText(['Busy', 'Done with', 'Still', 'Inbox'])
  await expect(page.locator(`[data-project-card="${still}"] [data-project-quiet]`)).toHaveText(
    'Quiet for 9 days',
  )
  await expect(page.locator(`[data-project-card="${done}"] [data-project-quiet]`)).toHaveCount(0)
})

test('the inbox card says how much waits to be sorted, and goes there', async ({ page }) => {
  await registerFreshUser(page)
  const { projects } = await (await page.request.get('/api/v1/projects')).json()
  const inbox = projects.find((p: { isInbox: boolean }) => p.isInbox).id as string
  for (const t of ['一', '二']) await makeTask(page, inbox, t)
  await page.goto('/projects')
  const card = page.locator(`[data-project-card="${inbox}"]`)
  await expect(card).toContainText('2 to sort')
  await expect(card).toContainText('Captured lines that have not been given a project yet.')
  await card.getByRole('link', { name: 'Sort the inbox' }).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${inbox}$`))
})

/** An archived project opens its page, which says it is archived -- not that it is gone. */
test('an archived project opens as itself, marked archived', async ({ page }) => {
  await registerFreshUser(page)
  const old = await makeProject(page, 'Old thing')
  await makeTask(page, old, 'Something left in it')
  const res = await page.request.patch(`/api/v1/projects/${old}`, {
    headers: WEB,
    data: { archived: true },
  })
  expect(res.ok(), await res.text()).toBe(true)
  await page.goto('/projects')
  // From the sidebar's list of the archived ones.
  const rail = page.getByRole('navigation', { name: 'Projects' })
  await rail.getByRole('button', { name: 'Archived' }).click()
  await rail.getByRole('link', { name: 'Old thing' }).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${old}$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Old thing' })).toBeVisible()
  await expect(page.locator('[data-project-archived]')).toHaveText('Archived')
  await expect(page.getByText(/^This project was deleted/)).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Location' })).not.toContainText('Not found')
  await expect(page.getByText('Something left in it')).toBeVisible()
})

/**
 * ARCHIVED FROM ITS OWN PAGE, AND BACK THE SAME WAY. Archive sets a line of work aside: it leaves
 * the rail and the live lists, and its page stays open, marked Archived, with the way back right
 * where the way out was.
 */
test('a project is archived from its own page, and brought back the same way', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await registerFreshUser(page)
  const pid = await makeProject(page, '旧项目')
  await makeTask(page, pid, '留下的')
  await page.goto(`/projects/${pid}`)
  const rail = page.getByRole('navigation', { name: 'Projects' })
  await expect(rail.getByRole('link', { name: '旧项目' })).toBeVisible()

  const patched = (archived: boolean) =>
    page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        r.url().endsWith(`/api/v1/projects/${pid}`) &&
        r.request().postDataJSON()?.archived === archived,
    )
  // In the head's More (FR-052).
  const more = page.getByRole('button', { name: 'More' })
  const archiving = patched(true)
  await more.click()
  await page.getByRole('menuitem', { name: 'Archive', exact: true }).click()
  expect((await archiving).ok()).toBe(true)
  await expect(page.locator('[data-project-archived]')).toHaveText('Archived')
  await expect(rail.getByRole('link', { name: '旧项目' })).toHaveCount(0)
  // Still its page, with its tasks.
  await expect(page.getByText('留下的')).toBeVisible()

  const restoring = patched(false)
  await more.click()
  await page.getByRole('menuitem', { name: 'Unarchive', exact: true }).click()
  expect((await restoring).ok()).toBe(true)
  await expect(page.locator('[data-project-archived]')).toHaveCount(0)
  await expect(rail.getByRole('link', { name: '旧项目' })).toBeVisible()
  await more.click()
  await expect(page.getByRole('menuitem', { name: 'Archive', exact: true })).toBeVisible()
})

/** The inbox is where capture lands: it cannot be archived, so its page offers no Archive. */
test('the inbox has no Archive', async ({ page }) => {
  await registerFreshUser(page)
  const listed = (await (await page.request.get('/api/v1/projects', { headers: WEB })).json()) as {
    projects: { id: string; isInbox: boolean }[]
  }
  const inbox = listed.projects.find((p) => p.isInbox)!.id
  await page.goto(`/projects/${inbox}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Archive', exact: true })).toHaveCount(0)
  // Its More edits it, and has no Archive.
  await page.getByRole('button', { name: 'More' }).click()
  await expect(page.getByRole('menuitem', { name: /Archive/ })).toHaveCount(0)
})

/**
 * NEW AND EDIT (FR-052): the initials follow the name until they are typed over, the colour is one
 * nobody has until one is picked, Ctrl Enter sends it from any field, and edits change the project
 * everywhere, renaming leaving the initials as they were.
 */
test('a new project takes its initials from its name and a colour nobody has, both changeable', async ({
  page,
}) => {
  await registerFreshUser(page)
  await page.goto('/projects')
  await page.getByRole('main').getByRole('link', { name: 'New project' }).click()
  await expect(page).toHaveURL(/\/projects\/new$/)
  const name = page.getByRole('textbox', { name: 'Name', exact: true })
  const initials = page.getByRole('textbox', { name: 'Initials' })
  await expect(name).toBeFocused()

  // Nothing is sent without a name.
  const posts: string[] = []
  page.on(
    'request',
    (r) => r.method() === 'POST' && r.url().endsWith('/projects') && posts.push(r.url()),
  )
  await name.press('Enter')
  await expect(page.getByText('Give the project a name.')).toBeVisible()
  expect(posts).toHaveLength(0)

  await name.fill('Find a lawyer')
  await expect(initials).toHaveValue('FL')
  // The inbox is blue, so the first colour nobody has is amber.
  await expect(page.getByRole('radio', { name: 'Amber' })).toBeChecked()
  await page.getByTitle('Teal').click()
  await expect(page.getByRole('radio', { name: 'Teal' })).toBeChecked()
  // Typed over, the initials stay when the name changes.
  await initials.fill('LW')
  await name.fill('Find a lawyer now')
  await expect(initials).toHaveValue('LW')

  const posted = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/projects',
  )
  await name.press('Control+Enter')
  const sent = await posted
  expect(sent.request().postDataJSON()).toEqual({
    name: 'Find a lawyer now',
    color: 'teal',
    initials: 'LW',
  })
  // Straight into it.
  await expect(page.getByRole('heading', { level: 1, name: 'Find a lawyer now' })).toBeVisible()
  await expect(
    page
      .getByRole('navigation', { name: 'Projects' })
      .getByRole('link', { name: /Find a lawyer now/ }),
  ).toContainText('LW')
})

test('a project is edited from its More menu, and the change shows everywhere', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Job hunt')
  await page.goto(`/projects/${pid}`)
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Edit project' }).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${pid}/edit$`))

  const name = page.getByRole('textbox', { name: 'Name', exact: true })
  const initials = page.getByRole('textbox', { name: 'Initials' })
  await expect(initials).toHaveValue('JH')
  // A rename leaves the initials as they are (FR-052).
  await name.fill('Job search')
  await expect(initials).toHaveValue('JH')
  await initials.fill('JS')
  await page.getByRole('button', { name: /^Save/ }).click()

  await expect(page).toHaveURL(new RegExp(`/projects/${pid}$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Job search' })).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Projects' }).getByRole('link', { name: /Job search/ }),
  ).toContainText('JS')
})

test('a task in an archived project names that project, reading and editing', async ({ page }) => {
  await registerFreshUser(page)
  const old = await makeProject(page, 'Old thing')
  await makeTask(page, old, 'Something left in it')
  const res = await page.request.patch(`/api/v1/projects/${old}`, {
    headers: WEB,
    data: { archived: true },
  })
  expect(res.ok(), await res.text()).toBe(true)
  await page.goto(`/projects/${old}`)
  await page.getByRole('listitem').filter({ hasText: 'Something left in it' }).first().click()
  const pane = page.getByRole('dialog', { name: 'Task details' })
  await expect(pane.getByText('Old thing', { exact: true })).toBeVisible()

  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  // It may stay where it is, so the picker names where that is.
  await expect(pane.getByRole('button', { name: 'Projects: Old thing' })).toBeVisible()
})

test('the New dialog on an archived project names that project', async ({ page }) => {
  await registerFreshUser(page)
  const old = await makeProject(page, 'Old thing')
  const res = await page.request.patch(`/api/v1/projects/${old}`, {
    headers: WEB,
    data: { archived: true },
  })
  expect(res.ok(), await res.text()).toBe(true)
  await page.goto(`/projects/${old}`)
  await openNewTask(page)
  const dialog = page.getByRole('dialog', { name: 'New task' })
  await expect(dialog.getByRole('button', { name: 'Projects: Old thing' })).toBeVisible()
})
