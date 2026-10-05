import { execFileSync } from 'node:child_process'
import type { Page } from '@playwright/test'

// Registers a brand-new user through the UI and waits until the signed-in shell is showing.
// Register is rate limited (20/min/IP), so every call uses a unique email. Returns that email.
export async function registerFreshUser(page: Page): Promise<string> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`

  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('correct horse battery')
  await page.getByRole('button', { name: 'Register' }).click()
  await page.getByTestId('current-user').waitFor()

  return email
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
  // Scoped to <main>: since the three-pane shell, the left rail ALSO lists every project by
  // name, so an unscoped getByText would match two elements and fail strict mode. The project
  // list page is the thing being exercised here, and it lives in the centre column.
  await page.getByRole('main').getByText(name, { exact }).click()
  await loaded
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
