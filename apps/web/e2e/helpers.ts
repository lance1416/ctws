import type { ProjectMovementResponse } from '@ctws/contracts'
import { execFileSync } from 'node:child_process'
import { expect, type Locator, type Page, type Request, type Route } from '@playwright/test'
import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'

/** A unique email: register is rate limited per IP, and each test needs a workspace of its own. */
const freshEmail = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`

export const PASSWORD = 'correct horse battery'

/**
 * Registers a brand-new user over the API, in the browser's own zone as the sign-up form does, and
 * opens the signed-in shell. Returns the email. The session cookie lands in the page's context, so
 * the page is signed in from its first load.
 *
 * Signing in opens the Workbench; it then goes on to `at`, Today by default because that is where
 * almost every test here does its work. `'/'` stays on the Workbench.
 *
 * It CLICKS the rail rather than calling `goto`: a fresh navigation leaves focus where the
 * document-level keys (the `g` chords, `/`, `f`) cannot see it.
 */
export async function registerFreshUser(page: Page, at: string = '/tasks/today'): Promise<string> {
  const email = freshEmail()
  const timezone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
  const res = await page.request.post('/api/v1/auth/register', {
    headers: WEB,
    data: { email, password: PASSWORD, timezone },
  })
  expect(res.status(), `register: ${await res.text()}`).toBe(201)

  await page.goto('/')
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

/** Registers a brand-new user through the sign-up form, for the tests whose subject it is. */
export async function signUpThroughForm(page: Page): Promise<string> {
  const email = freshEmail()
  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByTestId('current-user').waitFor()
  return email
}

/** Signs out through the top-right account menu. */
export async function logOut(page: Page): Promise<void> {
  await page.getByTestId('current-user').click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
}

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
  // Scoped to <main>: the left rail also lists every project by name, and the project list page
  // being exercised lives in the centre column.
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

// Picks a status in the open detail panel: the five marker shapes the rows use, as a radio group.
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

/** The app's own picker: a press on the trigger, then a press on the item. */
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
  // A trigger counted a moment ago may be gone by the time it is asked about; asking a gone one
  // would wait for it to come back, so the question is short and the next poll counts again.
  await expect
    .poll(
      async () =>
        (await trigger.count()) === 0 ||
        (await trigger
          .evaluate((el) => el === document.activeElement, undefined, { timeout: 250 })
          .catch(() => false)),
    )
    .toBe(true)
}

/** Holds every GET matching `url` for a while, so whatever waits on that read waits visibly. */
export async function slowReads(page: Page, url: string, ms = 400): Promise<void> {
  await page.route(url, async (r) => {
    if (r.request().method() === 'GET') await new Promise((done) => setTimeout(done, ms))
    await r.continue()
  })
}

/** A project made over the API, for tests whose subject is what comes next. */
export async function makeProject(page: Page, name: string): Promise<string> {
  const res = await page.request.post('/api/v1/projects', { headers: WEB, data: { name } })
  expect(res.ok(), `makeProject: ${res.status()}`).toBe(true)
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
  const res = await page.request.post('/api/v1/tasks', {
    headers: WEB,
    data: { projectId, title, parentId },
  })
  expect(res.ok(), `makeTask: ${res.status()}`).toBe(true)
  const id = ((await res.json()) as { id: string }).id
  if (Object.keys(patch).length > 0) {
    const done = await page.request.patch(`/api/v1/tasks/${id}`, { headers: WEB, data: patch })
    expect(done.ok(), `makeTask patch: ${done.status()}`).toBe(true)
  }
  return id
}

/** One task's own address. */
const TASK_URL = /\/api\/v1\/tasks\/[^/?]+$/

/** A move: a PATCH of a task that says where it lands. Tests that count moves share this. */
export const isMove = (r: Request): boolean =>
  r.method() === 'PATCH' &&
  TASK_URL.test(r.url()) &&
  'parentId' in ((r.postDataJSON() as object | null) ?? {})

/** Waits for a move the server accepted. */
export const taskMoved = (page: Page) => page.waitForResponse((r) => isMove(r.request()) && r.ok())

/** Records every move request the page sends, so a test can assert that none was. */
export function recordMoves(page: Page): string[] {
  const moves: string[] = []
  page.on('request', (r) => {
    if (isMove(r)) moves.push(r.url())
  })
  return moves
}

/** Answers every move with `handler`, letting other requests to a task through. */
export async function routeMoves(
  page: Page,
  handler: (route: Route) => Promise<void> | void,
): Promise<() => Promise<void>> {
  const route = (r: Route) => (isMove(r.request()) ? handler(r) : r.fallback())
  await page.route(TASK_URL, route)
  return () => page.unroute(TASK_URL, route)
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

/** A task as the server lists it. */
export type ServerTask = {
  id: string
  title: string
  status: string
  parentId: string | null
  scheduledOn: string | null
  dueAt: string | null
  notes: string | null
}

/** What the server holds for a project's tasks, read fresh. */
export async function serverTasks(page: Page, projectId: string): Promise<ServerTask[]> {
  const res = await page.request.get(`/api/v1/tasks?projectId=${projectId}`)
  return ((await res.json()) as { tasks: ServerTask[] }).tasks
}

/** One task the server holds, by id or by title, read fresh. */
export async function serverTask(page: Page, projectId: string, key: string): Promise<ServerTask> {
  const task = (await serverTasks(page, projectId)).find((t) => t.id === key || t.title === key)
  expect(task, `task ${key} on the server`).toBeDefined()
  return task!
}

/**
 * A reading item made over the API: created as a link or a book, then given whatever else `patch`
 * holds (a project, a title, an author, a plan), which the create body does not take.
 */
export async function makeReading(
  page: Page,
  create: { kind: 'link'; url: string } | { kind: 'book'; title: string },
  patch: Record<string, unknown> = {},
): Promise<string> {
  const res = await page.request.post('/api/v1/reading', { headers: WEB, data: create })
  expect(res.status(), `makeReading: ${await res.text()}`).toBe(201)
  const id = ((await res.json()) as { id: string }).id
  if (Object.keys(patch).length > 0) {
    const done = await page.request.patch(`/api/v1/reading/${id}`, { headers: WEB, data: patch })
    expect(done.ok(), `makeReading patch: ${done.status()}`).toBe(true)
  }
  return id
}

/** A PATCH to one task, as a response or the request behind it. */
const isTaskPatch = (r: { url: () => string; request: () => { method: () => string } }) =>
  r.request().method() === 'PATCH' && /\/tasks\/[^/]+$/.test(r.url())

/** Waits for a task PATCH the server accepted. */
export const taskPatched = (page: Page) => page.waitForResponse((r) => isTaskPatch(r) && r.ok())

/** Waits for the server's answer to a PATCH under `/api/v1/<path>`, accepted or not. */
export const patchAnswered = (page: Page, path: string) =>
  page.waitForResponse(
    (r) =>
      r.request().method() === 'PATCH' && new URL(r.url()).pathname.startsWith(`/api/v1/${path}`),
  )

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
  const res = await page.request.get('/api/v1/tasks?view=movement')
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
export async function apiPost<T = { id: string } & Record<string, string>>(
  page: Page,
  path: string,
  data: Record<string, unknown>,
): Promise<T> {
  const res = await page.request.post(`/api/v1${path}`, { headers: WEB, data })
  if (!res.ok()) throw new Error(`${path}: ${res.status()} ${await res.text()}`)
  // A write that answers with no body (204, such as a link) hands back nothing to read.
  if (res.status() === 204) return {} as T
  return (await res.json()) as T
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

/** The account's zone, as the server holds it. */
export async function accountZone(page: Page): Promise<string> {
  const me = await page.request.get('/api/v1/auth/me', { headers: WEB })
  return ((await me.json()) as { timezone: string }).timezone
}

/** Today, in `timeZone`. */
export const dayInZone = (timeZone: string) => new Date().toLocaleDateString('en-CA', { timeZone })

/**
 * A meeting at `hhmm` TODAY on the account's clock, agreed in `zone` -- which may be another one,
 * so the same instant is a different wall time where it was agreed.
 */
export async function meetingToday(
  page: Page,
  title: string,
  hhmm: string,
  zone: string,
  durationMinutes = 30,
): Promise<void> {
  const account = await accountZone(page)
  const [y, m, d] = dayInZone(account).split('-').map(Number) as [number, number, number]
  const [hh, mm] = hhmm.split(':').map(Number) as [number, number]
  const instant = new TZDate(y, m - 1, d, hh, mm, 0, 0, account)
  const startsLocal = format(new TZDate(instant.getTime(), zone), "yyyy-MM-dd'T'HH:mm")
  const res = await page.request.post('/api/v1/meetings', {
    headers: WEB,
    data: { title, startsLocal, timeZone: zone, durationMinutes },
  })
  expect(res.ok(), await res.text()).toBe(true)
}

/**
 * Holds a list's FIRST read until the returned `release` is called. The read is sent at once, so
 * its answer is the list as it was BEFORE whatever the test then writes: the stale answer that a
 * refetch after the write must not be handed (`refreshAfterWrites`).
 */
export async function holdFirstRead(page: Page, url: string): Promise<() => void> {
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  let first = true
  await page.route(url, async (route) => {
    if (route.request().method() !== 'GET' || !first) return route.continue()
    first = false
    const response = await route.fetch()
    await held
    await route.fulfill({ response })
  })
  return release
}

/**
 * The colour an element's background really paints, and how its text reads on it: every
 * background from the element up to the page, composited in order, so a translucent layer (hover,
 * select) counts as the colour it makes on its plane rather than as itself. Luminance is WCAG 2.1's.
 */
function paint(target: Locator): Promise<{ text: number; behind: number }> {
  return target.evaluate((el) => {
    type Rgba = { r: number; g: number; b: number; a: number }
    const rgba = (c: string): Rgba => {
      const n = c.match(/[\d.]+/g)!.map(Number)
      return { r: n[0]!, g: n[1]!, b: n[2]!, a: n[3] ?? 1 }
    }
    const over = (top: Rgba, under: Rgba): Rgba => ({
      r: top.r * top.a + under.r * (1 - top.a),
      g: top.g * top.a + under.g * (1 - top.a),
      b: top.b * top.a + under.b * (1 - top.a),
      a: 1,
    })
    const layers: Rgba[] = []
    for (let n: Element | null = el; n; n = n.parentElement) {
      const bg = rgba(getComputedStyle(n).backgroundColor)
      if (bg.a > 0) layers.push(bg)
    }
    let behind: Rgba = { r: 255, g: 255, b: 255, a: 1 }
    for (const layer of layers.reverse()) behind = over(layer, behind)
    const text = over(rgba(getComputedStyle(el).color), behind)
    const lum = ({ r, g, b }: Rgba) => {
      const ch = (v: number) => {
        const c = v / 255
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
    }
    return { text: lum(text), behind: lum(behind) }
  })
}

/** WCAG 2.1 contrast of an element's text against what is really behind it. */
export async function textContrast(target: Locator): Promise<number> {
  const { text, behind } = await paint(target)
  const [hi, lo] = [text, behind].sort((a, b) => b - a) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** Relative luminance of the background an element really paints. */
export async function surfaceLuminance(target: Locator): Promise<number> {
  return (await paint(target)).behind
}
