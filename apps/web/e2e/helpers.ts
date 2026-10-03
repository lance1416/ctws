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
  const loaded = page.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      /\/api\/v1\/projects\/[^/]+\/tasks$/.test(new URL(r.url()).pathname),
  )
  await page.getByText(name, { exact }).click()
  await loaded
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
