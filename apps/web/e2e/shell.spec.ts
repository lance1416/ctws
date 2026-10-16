import { expect, test } from '@playwright/test'
import {
  apiPost,
  editDetail,
  makeProject,
  makeTask,
  openDetail,
  openTree,
  registerFreshUser,
  sidewaysScroll,
  WEB,
} from './helpers'

test('the app shell routes between today, projects and a project', async ({ page }) => {
  await registerFreshUser(page)
  await expect(page.locator('#today-heading')).toBeVisible()

  // The id the API assigned to the inbox: the URL must carry exactly this, not merely
  // something shaped like a UUID.
  const res = await page.request.get('/api/v1/projects')
  const { projects } = (await res.json()) as { projects: { id: string; name: string }[] }
  const inbox = projects.find((p) => p.name === 'Inbox')!

  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Projects' })
    .click()
  await expect(page).toHaveURL(/\/projects$/)
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()
  // Registration creates the inbox, so the project list is never empty. Scoped to <main>: the
  // left rail lists the same projects.
  await page.getByRole('main').getByRole('link', { name: 'Inbox' }).click()

  await expect(page).toHaveURL(`/projects/${inbox.id}`)
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible()
})

test('an unauthenticated visit lands on login', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByLabel('Email')).toBeVisible()
})

// Tailwind 4 hoists an @theme nested in @media out of the query, so a build can end up with only
// the dark token values (light mode rendered dark). The two schemes must resolve differently.
test('light and dark colour schemes produce different page backgrounds', async ({ page }) => {
  await page.goto('/login')
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)

  await page.emulateMedia({ colorScheme: 'light' })
  const light = await background()
  await page.emulateMedia({ colorScheme: 'dark' })
  const dark = await background()

  expect(light).not.toBe(dark)
})

// A failed fetch must say so rather than render an empty list that reads as "no projects".
// Assert the exact text: a garbled string would still satisfy a bare "an alert exists".
test('a failed project list shows an error, not an empty list', async ({ page }) => {
  // Routed from the start, so every read of the list passes through here: signing in reads it
  // more than once (the rail, then each card on the Workbench), and a read already on its way when
  // the server starts failing would succeed and leave the page nothing to fail on.
  let failing = false
  let pending = 0
  await page.route('**/api/v1/projects', async (route) => {
    if (failing)
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: '{"title":"boom"}',
      })
    pending++
    try {
      await route.fulfill({ response: await route.fetch() })
    } finally {
      pending--
    }
  })
  await registerFreshUser(page)
  await expect(page.locator('#today-heading')).toBeVisible()
  await expect.poll(() => pending).toBe(0)
  failing = true

  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Projects' })
    .click()

  const alert = page.getByRole('alert')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText("Couldn't load projects")
})

/**
 * A SERVER THAT IS DOWN IS NOT A SIGNED-OUT VISITOR.
 *
 * Only a 401 answers "nobody is signed in". Swallowing every failure into that sends the reader
 * to a login page that cannot reach the server either, which reads as a password that stopped
 * working; everything that is not a 401 is the shell's to say.
 */
test('a server that cannot be reached says so instead of showing the login page', async ({
  page,
}) => {
  await registerFreshUser(page)
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"title":"boom"}' }),
  )
  await page.goto('/tasks/today')

  await expect(page.getByRole('alert')).toContainText("Can't reach the server")
  // NOT the login page: the session is still good, and saying otherwise is the defect.
  expect(new URL(page.url()).pathname).not.toBe('/login')
  await expect(page.getByRole('button', { name: 'Create an account' })).toHaveCount(0)
})

/**
 * The theme is written to `data-theme` on `<html>` by a script in `index.html` that runs before
 * React, so a reload never flashes the system theme first.
 */
test('the theme is picked in the account menu and survives a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await registerFreshUser(page)
  const ground = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const dark = await ground()

  await page.getByTestId('current-user').click()
  await page.getByRole('menuitemradio', { name: 'Light' }).click()
  const light = await ground()
  expect(light).not.toBe(dark)

  // Still light after a reload, with no flash of dark: the attribute is set before the first frame.
  await page.reload()
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light')
  expect(await ground()).toBe(light)

  // Back to System: the attribute goes, and the system's dark applies again.
  await page.getByTestId('current-user').click()
  await page.getByRole('menuitemradio', { name: 'System' }).click()
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBeUndefined()
  expect(await ground()).toBe(dark)
})

/**
 * THE HEADER SAYS WHERE YOU ARE. One canonical path, not history: a kind's page sits under Things
 * and a project page under Projects. The page you are on is named, not linked to itself.
 */
test('the header names where you are', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const where = page.getByRole('banner').getByRole('navigation', { name: 'Location' })
  await expect(where.getByRole('link')).toHaveText(['Things'])
  await expect(where.getByRole('link', { name: 'Things' })).toHaveAttribute('href', '/things')
  await expect(where.locator('[aria-current="page"]')).toHaveText('People')

  await page.goto('/')
  await expect(where.locator('[aria-current="page"]')).toHaveText('Workbench')
  await expect(where.getByRole('link')).toHaveCount(0)

  const res = await page.request.get('/api/v1/projects')
  const { projects } = (await res.json()) as { projects: { id: string; name: string }[] }
  const inbox = projects.find((p) => p.name === 'Inbox')!
  await page.goto(`/projects/${inbox.id}`)
  await expect(where.getByRole('link')).toHaveText(['Projects'])
  await expect(where.locator('[aria-current="page"]')).toHaveText('Inbox')
})

test('capture is in the header, and / reaches it from anywhere', async ({ page }) => {
  await registerFreshUser(page, '/')
  const box = page.getByRole('banner').getByRole('textbox', { name: 'Capture' })
  // Usable first: until the inbox has loaded there is nowhere to capture to, and a disabled box
  // cannot take the focus.
  await expect(box).toBeEnabled()
  await page.keyboard.press('/')
  await expect(box).toBeFocused()
})

test('the header reads in order from the keyboard', async ({ page }) => {
  await registerFreshUser(page, '/people')
  // Capture is disabled until it knows where a line would land, and a disabled box is skipped.
  await expect(page.getByRole('banner').getByRole('textbox', { name: 'Capture' })).toBeEnabled()
  await page.getByRole('banner').getByRole('link', { name: 'CTWS' }).focus()
  const reached: string[] = []
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab')
    reached.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement
        return el.getAttribute('aria-label') ?? el.innerText.split(/\s/)[0]!
      }),
    )
  }
  expect(reached.slice(0, 4)).toEqual(['Things', 'Search', 'Capture', 'Keyboard shortcuts'])
  expect(reached[4]).toMatch(/^Account/)
})

// -------------------------------------------------------------------------------------- phone
const PHONE = { width: 375, height: 812 }

test('on a phone, five tabs replace the rail', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await registerFreshUser(page, '/')
  // Exactly one navigation of that name is visible at any width: the rail and the bar are never
  // both in the accessibility tree.
  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  await expect(nav).toHaveCount(1)
  await expect(nav.getByRole('link')).toHaveText(['Workbench', 'Today', 'Projects', 'Calendar'])
  await nav.getByRole('button', { name: 'Search' }).click()
  await expect(page.getByRole('dialog', { name: 'Search' })).toBeVisible()
})

test('nothing scrolls sideways on a phone, whatever the page', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await registerFreshUser(page, '/')
  const id = await makeProject(page, '一个名字很长很长的求职项目与面试准备')
  for (const path of ['/', '/things', `/projects/${id}`, '/people']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await sidewaysScroll(page), `${path} scrolls sideways`).toEqual({ doc: 0, body: 0 })
  }
  // The long name truncates in the header rather than pushing it onto a second line.
  const banner = await page.getByRole('banner').boundingBox()
  expect(banner!.height).toBeLessThanOrEqual(60)
})

test('the tab bar never covers the end of the page', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await registerFreshUser(page, '/')
  // Not the inbox: it cannot be deleted, so its page has no delete button to end on.
  const id = await makeProject(page, '长清单')
  for (let i = 0; i < 14; i++) await makeTask(page, id, `第 ${i + 1} 件`)
  await page.goto(`/projects/${id}`)
  await expect(page.getByText('第 14 件')).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const bar = await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox()
  const last = await page.getByRole('button', { name: 'Delete project' }).boundingBox()
  expect(last!.y + last!.height).toBeLessThanOrEqual(bar!.y)
})

/** What is under the middle of `locator`: the control itself, or something drawn over it. */
async function topmostAt(
  page: import('@playwright/test').Page,
  box: { x: number; y: number; width: number; height: number },
) {
  return page.evaluate(
    ([x, y]) => document.elementFromPoint(x!, y!)?.closest('button, a')?.textContent ?? null,
    [box.x + box.width / 2, box.y + box.height / 2],
  )
}

test('on a phone, a detail pane ends above the tab bar, so its last control can be pressed', async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  await registerFreshUser(page, '/people')
  const { id } = await apiPost(page, '/people', { name: '要删的人' })
  await page.goto(`/people/${id}`)
  const remove = page
    .getByRole('dialog', { name: 'People' })
    .getByRole('button', { name: 'Delete person' })
  await remove.scrollIntoViewIfNeeded()
  expect(await topmostAt(page, (await remove.boundingBox())!)).toContain('Delete person')
})

test('on a phone, a dialog ends above the tab bar too', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await registerFreshUser(page, '/people')
  await page.getByRole('button', { name: 'New person' }).click()
  const create = page
    .getByRole('dialog', { name: 'New person' })
    .getByRole('button', { name: 'Create' })
  await create.scrollIntoViewIfNeeded()
  expect(await topmostAt(page, (await create.boundingBox())!)).toContain('Create')
})

for (const width of [320, 375]) {
  test(`at ${width}px the header still names the page, clear of Capture`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 })
    await registerFreshUser(page, '/people')
    const current = page.getByRole('banner').locator('[aria-current="page"]')
    await expect(current).toHaveText('People')
    expect(await current.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    const named = (await current.boundingBox())!
    const capture = (await page
      .getByRole('banner')
      .getByRole('textbox', { name: 'Capture' })
      .boundingBox())!
    expect(named.x + named.width).toBeLessThanOrEqual(capture.x)
  })
}

test('the rail marks Things while you are on a kind of thing', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const rail = page.getByRole('navigation', { name: 'Main navigation' })
  await expect(rail.getByRole('link', { name: 'Things' })).toHaveAttribute('aria-current', 'page')
  await page.goto('/meetings')
  await expect(rail.getByRole('link', { name: 'Things' })).toHaveAttribute('aria-current', 'page')
  await page.goto('/tasks/today')
  await expect(rail.getByRole('link', { name: 'Things' })).not.toHaveAttribute(
    'aria-current',
    'page',
  )
})

test("on a phone, the Today tab says how much is on today's plate", async ({ page }) => {
  await page.setViewportSize(PHONE)
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, 'Late one', { dueAt: '2020-01-01T09:00:00.000Z' })
  await page.reload()
  const today = page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: /^Today/ })
  await expect(today.locator('[data-count]')).toHaveText('1')
})

test('at 320px what capture says stays on the screen, however long the name', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await registerFreshUser(page, '/')
  const all = await page.request.get('/api/v1/projects', { headers: WEB })
  const { projects } = (await all.json()) as { projects: { id: string; isInbox: boolean }[] }
  const inbox = projects.find((p) => p.isInbox)!
  const renamed = await page.request.patch(`/api/v1/projects/${inbox.id}`, {
    headers: WEB,
    data: { name: '一个名字很长很长的求职项目与面试准备' },
  })
  expect(renamed.ok(), await renamed.text()).toBe(true)
  await page.reload()

  const capture = page.getByRole('banner').getByRole('textbox', { name: 'Capture' })
  await expect(capture).toBeEnabled()
  await capture.fill('Buy milk')
  await capture.press('Enter')
  const said = page.getByRole('banner').getByRole('status').filter({ hasText: 'Added to' })
  await expect(said).toBeVisible()
  const box = (await said.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(320)
})

test('the rail stays beside the page as a long page scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 })
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, 'P')
  for (let i = 0; i < 30; i++) await makeTask(page, pid, `一条 ${i}`)
  await page.goto(`/projects/${pid}`)
  await expect(page.locator('[data-task-tree] li[data-depth]')).toHaveCount(30)
  const rail = page.getByRole('navigation', { name: 'Main navigation' })
  const before = (await rail.boundingBox())!
  await page.mouse.wheel(0, 900)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300)
  // The frame round the sheet does not scroll away and leave white beside it.
  expect(Math.round((await rail.boundingBox())!.y)).toBe(Math.round(before.y))
})

test('on a phone, several things in progress are rows, not a column of empty space', async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, 'P')
  for (const t of ['一', '二', '三']) await makeTask(page, pid, t, { status: 'in_progress' })
  await page.goto('/tasks/today')
  const rows = page.locator('[data-panel="In progress"] li')
  await expect(rows).toHaveCount(3)
  for (const h of await rows.evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().height),
  ))
    expect(h).toBeLessThanOrEqual(66)
})

test('a failed background check of the session keeps the page and its unsaved edit', async ({
  page,
}) => {
  await registerFreshUser(page)
  const projectId = await makeProject(page, 'Offline')
  await makeTask(page, projectId, 'Half written')
  await openTree(page, projectId)
  await openDetail(page, 'Half written')
  await editDetail(page)
  const title = page.getByRole('textbox', { name: 'Title' })
  await title.fill('Half written, then more')
  await page.route('**/api/v1/auth/me', (r) => r.fulfill({ status: 503, body: '{}' }))
  // A tab coming back into view refetches the session.
  const checked = page.waitForResponse('**/api/v1/auth/me')
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await checked
  await expect(page.getByText("Can't reach the server")).toHaveCount(0)
  await expect(title).toHaveValue('Half written, then more')
})
