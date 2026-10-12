import type { ProjectMovementResponse } from '@ctws/contracts'
import { execFileSync } from 'node:child_process'
import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Registers a brand-new user through the UI and waits until the signed-in shell is showing.
 * Register is rate limited (20/min/IP), so every call uses a unique email. Returns that email.
 *
 * It then goes on to Today, because that is where almost every test here does its work and it is
 * where registration used to land. Signing in now opens the WORKBENCH -- the shell's own page --
 * so that step is explicit. `at` takes any path, and `'/'` stays put.
 *
 * It CLICKS the rail rather than calling `goto`: a fresh navigation leaves focus where the
 * document-level keys (the `g` chords, `/`, `f`) cannot see it, which silently breaks every
 * keyboard test that follows.
 */
export async function registerFreshUser(page: Page, at: string = '/tasks/today'): Promise<string> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`

  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('correct horse battery')
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByTestId('current-user').waitFor()

  if (at === '/tasks/today') {
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Today' })
      .click()
  } else if (at !== '/') {
    await page.goto(at)
  }

  return email
}

/**
 * Signs out through the account menu.
 *
 * The bar used to carry a bare `Log out` button; it is an item in the top-right account menu
 * now, which is where every workspace app of this shape puts it. One helper so the twelve call
 * sites do not each know the menu's shape.
 */
export async function logOut(page: Page): Promise<void> {
  await page.getByTestId('current-user').click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
}

/** Opens the account menu without acting, for tests about the bar itself. */

// Submits one of the create inputs (capture, new project, new task) and waits for the POST to be
// acknowledged. Without the wait the next locator's auto-wait is the only thing between the test
// and a slow API, which is a race under load.
export async function submitCreate(page: Page, placeholder: string, text: string): Promise<void> {
  const created = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      r.ok() &&
      /\/api\/v1\/(tasks|projects)$/.test(new URL(r.url()).pathname),
  )
  await page.getByPlaceholder(placeholder).fill(text)
  await page.getByPlaceholder(placeholder).press('Enter')
  await created
}

// Opens a project from the list and waits for its task list to arrive. Creating a task while the
// first list fetch is still in flight is a race: the page's own refetch can be satisfied by that
// stale in-flight request, and the new task never shows up.
export async function openProject(page: Page, name: string, exact = false): Promise<void> {
  const loaded = page.waitForResponse((r) => {
    // The task module lists a project's tasks at `GET /api/v1/tasks?projectId=<id>`: the project
    // is the shell's, so it is a filter rather than a path segment of the module's route.
    const url = new URL(r.url())
    return (
      r.request().method() === 'GET' &&
      url.pathname === '/api/v1/tasks' &&
      url.searchParams.has('projectId')
    )
  })
  // Scoped to <main>: since the three-pane shell, the left rail ALSO lists every project by
  // name, so an unscoped getByText would match two elements and fail strict mode. The project
  // list page is the thing being exercised here, and it lives in the centre column.
  await page.getByRole('main').getByText(name, { exact }).click()
  await loaded
}

/**
 * Puts the OPEN detail pane into editing mode.
 *
 * The pane opens in READING mode: title, read-only status and dates and the notes as prose, with
 * not one control on screen that can change a value. Everything that can be typed into lives behind
 * Edit.
 *
 * `exact` is not optional here: accessible names share one flat namespace and Playwright matches
 * them by substring, and the unsaved-edit guard's "Keep editing" contains "Edit".
 */
export async function editDetail(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  // The pane has handed focus to the title field, so the controls are really there before the
  // caller's next locator runs.
  await page.getByRole('textbox', { name: 'Title' }).waitFor()
}

// Picks a status in the open detail panel. Status there is no longer a <select> of words but the
// same five marker shapes the rows use, as a radio group: one tab stop, arrow keys inside it.
// The VALUE written is unchanged, which is what every caller of this is actually about.
export async function setDetailStatus(page: Page, label: string): Promise<void> {
  await page.getByRole('radio', { name: label, exact: true }).check()
}

// Moves a finished task's completion back in time. The API (rightly) offers no way to set
// completed_at, and a view grouped by day cannot be tested without days of history, so this goes
// to the database the stack is running on. Needs `docker compose` and the stack up, like the
// rest of the e2e.
export function backdateCompletion(taskId: string, ago: string): void {
  if (!/^[0-9a-f-]{36}$/.test(taskId) || !/^\d+ (minutes|hours|days)$/.test(ago)) {
    throw new Error('backdateCompletion: refusing a malformed argument')
  }
  const out = execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'ctws',
      '-d',
      'ctws',
      '-c',
      `update tasks set completed_at = now() - interval '${ago}' where id = '${taskId}' and status = 'done'`,
    ],
    { stdio: 'pipe' },
  ).toString()
  // A no-op update would leave the test proving nothing about history.
  if (!out.includes('UPDATE 1')) throw new Error(`backdateCompletion: no row updated: ${out}`)
}

/**
 * Pushes a project's whole logged history back in time, so Movement's stagnation line can be
 * tested without waiting a week. Like `backdateCompletion` this goes to the database the stack is
 * running on: the API (rightly) offers no way to write an event's timestamp, and a panel about
 * "how long has this been quiet" cannot be tested without history.
 *
 * It deliberately moves the EVENT LOG and not `updated_at`: the panel reads the log precisely so
 * that a reorder cannot make a dead project look alive, and a helper that moved the wrong column
 * would let a broken panel pass.
 */
export function backdateProjectActivity(projectId: string, ago: string): void {
  if (!/^[0-9a-f-]{36}$/.test(projectId) || !/^\d+ (minutes|hours|days)$/.test(ago)) {
    throw new Error('backdateProjectActivity: refusing a malformed argument')
  }
  const out = execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'ctws',
      '-d',
      'ctws',
      '-c',
      `update task_events set occurred_at = now() - interval '${ago}' ` +
        `where task_id in (select id from tasks where project_id = '${projectId}')`,
    ],
    { stdio: 'pipe' },
  ).toString()
  // A no-op update would leave the test proving nothing about history.
  if (/UPDATE 0/.test(out) || !out.includes('UPDATE')) {
    throw new Error(`backdateProjectActivity: no row updated: ${out}`)
  }
}

/**
 * THE APP'S OWN PICKER, which replaced every native `<select>`: the OS draws a native popup and
 * does not know this palette, so on Windows the list came up white with the page's own light-grey
 * text on it. A pick is now a press on the trigger and a press on the item.
 */
export async function pickOne(
  where: Page | Locator,
  label: string,
  choice: string | RegExp,
): Promise<void> {
  const page = 'page' in where ? where.page() : where
  const trigger = where.getByRole('button', { name: new RegExp(`^${label}`) })
  await trigger.click()
  await page.getByRole('menuitem', { name: choice }).click()
  // The menu hands focus back to its trigger a moment after it closes. Under load that lands
  // after the caller has moved on -- into a field it then types in, so the keystrokes go to the
  // trigger and the field is left empty, which a field that speaks up when it is left reads as
  // the person leaving it. Return only once the hand-back has happened -- or once there is no
  // trigger to hand it back to, for a pick that takes its own control away.
  await expect
    .poll(
      async () =>
        (await trigger.count()) === 0 ||
        (await trigger.evaluate((el) => el === document.activeElement)),
    )
    .toBe(true)
}

/**
 * A PROJECT AND A TASK, made over the API because the point of the test is what comes next.
 *
 * These were written out in fourteen spec files and thirteen, and the thirteen had grown FOUR
 * signatures between them -- a positional patch, a positional parent, an options object, and
 * neither. That is what copying a helper does: every copy is free to drift, and the drift is
 * invisible until you read two specs side by side.
 */
export async function makeProject(page: Page, name: string): Promise<string> {
  const res = await page.request.post('/api/v1/projects', {
    headers: { 'x-ctws-client': 'web' },
    data: { name },
  })
  expect(res.ok(), `makeProject: ${res.status()}`).toBeTruthy()
  return ((await res.json()) as { id: string }).id
}

export async function makeTask(
  page: Page,
  projectId: string,
  title: string,
  /** Fields to set after creating it: the create body takes only a title and a parent. */
  patch: Record<string, unknown> = {},
  parentId: string | null = null,
): Promise<string> {
  const headers = { 'x-ctws-client': 'web' }
  const res = await page.request.post('/api/v1/tasks', {
    headers,
    data: { projectId, title, parentId },
  })
  expect(res.ok(), `makeTask: ${res.status()}`).toBeTruthy()
  const id = ((await res.json()) as { id: string }).id
  if (Object.keys(patch).length > 0) {
    const done = await page.request.patch(`/api/v1/tasks/${id}`, { headers, data: patch })
    expect(done.ok(), `makeTask patch: ${done.status()}`).toBeTruthy()
  }
  return id
}

/** The move endpoint. Tests that count writes to it share one spelling. */
export const MOVE_URL = /\/tasks\/[^/]+\/move$/

/** Records every move request the page sends, so a test can assert that none was. */
export function recordMoves(page: Page): string[] {
  const moves: string[] = []
  page.on('request', (r) => {
    if (MOVE_URL.test(r.url())) moves.push(r.url())
  })
  return moves
}

/**
 * Opens a project's page and waits for the task LIST, not for a row: a project whose only task is
 * finished renders no rows at all (the tree hides them), and waiting for one would hang.
 */
export async function openTree(page: Page, projectId: string): Promise<void> {
  const listed = page.waitForResponse((r) => {
    const url = new URL(r.url())
    return (
      r.request().method() === 'GET' &&
      url.pathname === '/api/v1/tasks' &&
      url.searchParams.get('projectId') === projectId
    )
  })
  await page.goto(`/projects/${projectId}`)
  await listed
}

/** Makes a project THROUGH THE UI and lands on its page, for tests about that route in. */
export async function startProject(page: Page, name = 'P'): Promise<string> {
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Projects' })
    .click()
  await submitCreate(page, 'New project', name)
  await openProject(page, name, true)
  return page.url()
}

/**
 * Builds a tree through the API, which is far faster than the UI. `spec` lists titles with the
 * title of their parent, in creation order; `where` takes a project id or a project page's url.
 * Returns the ids by title.
 *
 * Given a URL it then SHOWS that page and waits for every row: the rows were written behind the
 * app's back, so a test that starts asserting before the reload is racing its own fixture.
 */
export async function seedTasks(
  page: Page,
  where: string,
  spec: [title: string, parent: string | null][],
): Promise<Map<string, string>> {
  const isUrl = where.includes('/')
  const projectId = isUrl ? where.split('/').pop()! : where
  const ids = new Map<string, string>()
  for (const [title, parent] of spec) {
    ids.set(title, await makeTask(page, projectId, title, {}, parent ? ids.get(parent)! : null))
  }
  if (isUrl) {
    await page.goto(where)
    await expect(page.getByRole('listitem')).toHaveCount(spec.length)
  }
  return ids
}

/** The server's view of a project's tree, as title -> parent title (null for a root). */
export async function serverParents(
  page: Page,
  where: string,
): Promise<Record<string, string | null | undefined>> {
  const projectId = where.includes('/') ? where.split('/').pop()! : where
  const res = await page.request.get(`/api/v1/tasks?projectId=${projectId}`)
  const { tasks } = (await res.json()) as {
    tasks: { id: string; title: string; parentId: string | null }[]
  }
  const title = new Map(tasks.map((t) => [t.id, t.title]))
  return Object.fromEntries(tasks.map((t) => [t.title, t.parentId ? title.get(t.parentId) : null]))
}

/**
 * Opens a tree row's detail the keyboard way. A CLICK on the handle deliberately does not open it
 * (it starts a drag), so Enter on the focused handle is the way in.
 */
export async function openDetail(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: `Task: ${title}`, exact: true }).focus()
  await page.keyboard.press('Enter')
}

/** What the server reports for the Movement panel and the project banner, in its own words. */
export async function movementOf(page: Page): Promise<ProjectMovementResponse[]> {
  const res = await page.request.get('/api/v1/tasks/movement')
  return ((await res.json()) as { projects: ProjectMovementResponse[] }).projects
}

/**
 * The header every write from the app carries. The API refuses a write without it (the CSRF
 * guard), so a test that posts over `page.request` has to send it too.
 */
export const WEB = { 'x-ctws-client': 'web' }

/**
 * Makes one of anything over the API and hands back what the server said, for the tests whose
 * subject is what comes NEXT. It throws on a refusal: a fixture that failed quietly turns the
 * real assertion into a mystery about an empty page.
 */
export async function apiPost(
  page: Page,
  path: string,
  data: Record<string, unknown>,
): Promise<Record<string, string>> {
  const res = await page.request.post(`/api/v1${path}`, { headers: WEB, data })
  if (!res.ok()) throw new Error(`${path}: ${res.status()} ${await res.text()}`)
  return (await res.json()) as Record<string, string>
}

/**
 * How far the page can be scrolled sideways, which must be 0 at every width this app claims to
 * work at. BOTH the document and the body: a layout can overflow one and not the other, and the
 * one that overflows is whichever element the offending rule happens to sit on.
 */
export async function sidewaysScroll(page: Page): Promise<{ doc: number; body: number }> {
  return page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }))
}
