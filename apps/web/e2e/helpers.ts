import { execFileSync } from 'node:child_process'
import type { Page } from '@playwright/test'

/**
 * Registers a brand-new user through the UI and waits until the signed-in shell is showing.
 * Register is rate limited (20/min/IP), so every call uses a unique email. Returns that email.
 *
 * It then goes on to 今天, because that is where almost every test here does its work and it is
 * where registration used to land. Signing in now opens the WORKBENCH -- the shell's own page --
 * so the step that used to be implicit is explicit. `at` takes any path, and `'/'` stays put.
 *
 * It CLICKS the rail rather than calling `goto`: a fresh navigation leaves focus where the
 * document-level keys (the `g` chords, `/`, `f`) cannot see it, which silently breaks every
 * keyboard test that follows.
 */
export async function registerFreshUser(page: Page, at: string = '/tasks/today'): Promise<string> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`

  await page.goto('/')
  await page.getByLabel('邮箱').fill(email)
  await page.getByLabel('密码').fill('correct horse battery')
  await page.getByRole('button', { name: '注册' }).click()
  await page.getByTestId('current-user').waitFor()

  if (at === '/tasks/today') {
    await page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('link', { name: '今天' })
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
  await page.getByRole('menuitem', { name: '退出登录' }).click()
}

/** Opens the account menu without acting, for tests about the bar itself. */
export const accountButton = (page: Page) => page.getByTestId('current-user')

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
 * The pane opens in READING mode (rows-and-reading spec §5): title, read-only status and dates and
 * the notes as prose, with not one control on screen that can change a value. Everything that can
 * be typed into lives behind 编辑. Every assertion about what a control WRITES is unchanged; only
 * the press that reveals the control is new.
 *
 * `exact` is not optional here: accessible names share one flat namespace and Playwright matches
 * them by substring, and the unsaved-edit guard's 继续编辑 contains 编辑.
 */
export async function editDetail(page: Page): Promise<void> {
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  // The pane has handed focus to the title field, so the controls are really there before the
  // caller's next locator runs.
  await page.getByRole('textbox', { name: '标题' }).waitFor()
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
 * Pushes a project's whole logged history back in time, so 做到哪儿了's stagnation line can be
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
