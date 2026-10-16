import type { ProjectId, TaskId, WorkspaceId } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { expect } from 'vitest'
import { lockTaskTree } from '../../src/modules/tasks/tree'
import type { Unfurl } from '../../src/modules/reading/unfurl/unfurl'
import type { Env } from '../../src/platform/config'
import type { Tx } from '../../src/platform/db/client'
import type { EnvSource } from '../../src/shell/module'
import { withApp } from './app'

export type Harness = Awaited<ReturnType<typeof withApp>> & {
  cookie: string
  authed: Record<string, string>
}

const clientHeader = { 'x-ctws-client': 'web' }

/**
 * Boots an app with open registration and registers one user. The caller owns `ctx.stop()`.
 * `authed` is a ready-to-use header bag carrying the session cookie.
 *
 * Each call gets its own database, so a workspace-isolation test built from two calls passes
 * trivially. Make the second user with `secondUser` instead.
 */
export async function appWithUser(email = 'p@example.com', opts: Opts = {}): Promise<Harness> {
  const ctx = await withApp(
    { authRegistration: 'open', ...opts.env },
    {
      ...(opts.unfurl ? { unfurl: opts.unfurl } : {}),
      ...(opts.clock ? { clock: opts.clock } : {}),
      ...(opts.moduleEnv ? { moduleEnv: opts.moduleEnv } : {}),
    },
  )
  const cookie = await register(ctx, email, opts.timezone ?? 'UTC')
  return { ...ctx, cookie, authed: { ...clientHeader, cookie } }
}

/** Registers an account on `ctx`'s app and answers its session cookie. */
async function register(
  ctx: Pick<Harness, 'app'>,
  email: string,
  timezone: string,
): Promise<string> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers: clientHeader,
    payload: { email, password: 'correct horse battery', timezone },
  })
  if (res.statusCode !== 201) throw new Error(`register: ${res.statusCode} ${res.body}`)
  return String(res.headers['set-cookie']).split(';')[0]!
}

/**
 * Another account on the same app, hence the same database: what it can see of the first is a real
 * isolation test. Builders given it act as that account.
 */
export async function secondUser(
  ctx: Harness,
  email = 'other@example.com',
  timezone = 'UTC',
): Promise<Harness> {
  const cookie = await register(ctx, email, timezone)
  return { ...ctx, cookie, authed: { ...clientHeader, cookie } }
}

/** A project's tasks through the listing endpoint. */
export async function tasksOf(
  ctx: Harness,
  projectId: ProjectId,
): Promise<{ id: TaskId; parentId: TaskId | null; rank: string }[]> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/tasks?projectId=${projectId}`,
    headers: ctx.authed,
  })
  if (res.statusCode !== 200) throw new Error(`tasksOf: ${res.statusCode} ${res.body}`)
  return res.json().tasks
}

/** A task's events read straight from the log. */
export async function eventsOf(
  ctx: Harness,
  taskId: TaskId,
): Promise<{ type: string; payload: unknown }[]> {
  const r = await ctx.db.execute(sql`
    select type, payload from task_events where task_id = ${taskId} order by occurred_at, id
  `)
  return r.rows as { type: string; payload: unknown }[]
}

/** `expectBlockedWhile` the workspace's task tree lock is held. */
export async function expectBlockedByTreeLock<T>(ctx: Harness, fire: () => Promise<T>): Promise<T> {
  const { workspaceId } = (
    await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: ctx.authed })
  ).json() as { workspaceId: WorkspaceId }
  return expectBlockedWhile(ctx, (tx) => lockTaskTree(tx, workspaceId), fire)
}

/**
 * Fires a request while `take` holds a lock on another transaction, asserts the request is still
 * in flight after a moment, then releases the lock and returns the response.
 *
 * This is a MECHANISM test, not a race test. Reproducing the interleaving the lock prevents needs
 * a pause point inside the command transaction -- a hook in production code -- and an attempt at
 * it without one passed with the lock removed, which is the definition of a vacuous test. Holding
 * the lock from outside instead is deterministic in the safe direction: a blocked request stays
 * blocked indefinitely, so the wait cannot end early by luck; it could only ever be too short,
 * and an unblocked request finishes in single-digit milliseconds.
 *
 * What it does NOT prove is where in the transaction the lock is taken. A caller that took it last
 * would contend identically here and be useless, so "first statement" rests on the commands, not
 * on this helper.
 */
export async function expectBlockedWhile<T>(
  ctx: Harness,
  take: (tx: Tx) => Promise<unknown>,
  fire: () => Promise<T>,
): Promise<T> {
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let locked!: () => void
  const lockTaken = new Promise<void>((resolve) => {
    locked = resolve
  })
  const holding = ctx.db.transaction(async (tx) => {
    await take(tx)
    locked()
    await held
  })
  // The request goes out only once the lock is held, or it could take the lock first. A holder
  // that fails before taking it fails the test here.
  await Promise.race([lockTaken, holding])

  let settled = false
  const pending = fire().then((res) => {
    settled = true
    return res
  })

  try {
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(settled).toBe(false)
  } finally {
    // Always, or a failed assertion would leave the lock held and the pending request would hang
    // the suite's teardown instead of reporting the failure.
    release()
    await holding
    // Keep a failed assertion's output clean: the request is still in flight on that path, and an
    // unawaited rejection would pile onto the real failure.
    pending.catch(() => {})
  }
  return pending
}

/** The headers a browser sends; the CSRF guard refuses a write without them. */
export const web = (ctx: Harness) => ({ ...ctx.authed, 'x-ctws-client': 'web' })

/** What a test may replace: the outbound fetch, env values, the clock and the user's zone. */
export type Opts = {
  unfurl?: Unfurl
  env?: Partial<Env>
  /** The environment the modules read their own settings from. */
  moduleEnv?: EnvSource
  clock?: () => Date
  timezone?: string
}

/** `appWithUser`, with its teardown pushed onto the caller's list for `afterEach` to drain. */
export async function setupWith(
  cleanups: (() => Promise<void>)[],
  email?: string,
  opts: Opts = {},
): Promise<Harness> {
  const ctx = await appWithUser(email ?? 'p@example.com', opts)
  cleanups.push(ctx.stop)
  return ctx
}
