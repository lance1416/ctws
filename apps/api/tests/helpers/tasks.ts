import { sql } from 'drizzle-orm'
import { expect } from 'vitest'
import { lockTaskTree } from '../../src/modules/tasks/tree'
import type { Env } from '../../src/platform/config'
import type { Unfurl } from '../../src/modules/reading/unfurl/unfurl'
import { withApp } from './app'

export type TaskCtx = Awaited<ReturnType<typeof withApp>> & {
  cookie: string
  authed: Record<string, string>
}

const clientHeader = { 'x-ctws-client': 'web' }

/**
 * Boots an app with open registration and registers one user. The caller owns `ctx.stop()`.
 * `authed` is a ready-to-use header bag carrying the session cookie.
 *
 * EACH CALL BOOTS ITS OWN POSTGRES CONTAINER. Two calls give two unrelated databases, so a test
 * of workspace isolation built from two `appWithUser()`s passes trivially. Create the second
 * user through `ctx.app.inject` (POST /api/v1/auth/register) on the same app instead.
 */
export async function appWithUser(email = 'p@example.com', opts: Opts = {}): Promise<TaskCtx> {
  const ctx = await withApp(
    { authRegistration: 'open', ...opts.env },
    {
      ...(opts.unfurl ? { unfurl: opts.unfurl } : {}),
      ...(opts.clock ? { clock: opts.clock } : {}),
    },
  )
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers: clientHeader,
    payload: { email, password: 'correct horse battery', timezone: opts.timezone ?? 'UTC' },
  })
  const cookie = String(res.headers['set-cookie']).split(';')[0]!
  return { ...ctx, cookie, authed: { ...clientHeader, cookie } }
}

export async function createProject(ctx: TaskCtx, name: string): Promise<string> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/projects',
    headers: ctx.authed,
    payload: { name },
  })
  return res.json().id as string
}

export async function createTask(
  ctx: TaskCtx,
  projectId: string,
  title: string,
  parentId?: string,
): Promise<string> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/tasks',
    headers: ctx.authed,
    payload: { projectId, title, ...(parentId ? { parentId } : {}) },
  })
  if (res.statusCode !== 201) throw new Error(`createTask: ${res.statusCode} ${res.body}`)
  return res.json().id as string
}

/**
 * A straight parent->child chain `depth` nodes long. Returns ids root-first, so
 * `chain[0]` is at depth 1 and `chain[depth - 1]` is the leaf at depth `depth`.
 */
export async function createChain(
  ctx: TaskCtx,
  projectId: string,
  depth: number,
): Promise<string[]> {
  const ids: string[] = []
  let parent: string | undefined
  for (let i = 0; i < depth; i++) {
    parent = await createTask(ctx, projectId, `n${i}`, parent)
    ids.push(parent)
  }
  return ids
}

/** Needs the listing endpoint from Task 8; Task 7's own tests do not use it. */
export async function tasksOf(
  ctx: TaskCtx,
  projectId: string,
): Promise<{ id: string; parentId: string | null; rank: string }[]> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/tasks?projectId=${projectId}`,
    headers: ctx.authed,
  })
  if (res.statusCode !== 200) throw new Error(`tasksOf: ${res.statusCode} ${res.body}`)
  return res.json().tasks
}

/** Reads the log directly: the endpoint that serves it only arrives in Task 10. */
export async function eventsOf(
  ctx: TaskCtx,
  taskId: string,
): Promise<{ type: string; payload: unknown }[]> {
  const r = await ctx.db.execute(sql`
    select type, payload from task_events where task_id = ${taskId} order by occurred_at
  `)
  return r.rows as { type: string; payload: unknown }[]
}

/**
 * Fires a request while the tree lock is held on another transaction, asserts the request is
 * still in flight after a moment, then releases the lock and returns the response.
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
export async function expectBlockedByTreeLock<T>(ctx: TaskCtx, fire: () => Promise<T>): Promise<T> {
  const { workspaceId } = (
    await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: ctx.authed })
  ).json() as { workspaceId: string }

  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const holding = ctx.db.transaction(async (tx) => {
    await lockTaskTree(tx, workspaceId)
    await held
  })

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

/**
 * THE HEADERS A BROWSER SENDS. The guard refuses a cookie-authenticated write without them (CSRF),
 * so every test that writes through the app has to send them -- and seven test files wrote this
 * same line out to do it.
 */
export const web = (ctx: TaskCtx) => ({ ...ctx.authed, 'x-ctws-client': 'web' })

/**
 * An app with one user, registered, whose teardown the CALLER owns.
 *
 * Nineteen test files wrote the same four lines: boot, push the stop onto a list, return. The
 * list is the caller's because `afterEach` is where it has to be drained, and a helper that
 * owned it would be a second lifetime to reason about.
 */
/** 一次性换掉的东西：出站抓取，以及想盖掉的几个 env 值。 */
export type Opts = {
  unfurl?: Unfurl
  env?: Partial<Env>
  clock?: () => Date
  timezone?: string
}

export async function setupWith(
  cleanups: (() => Promise<void>)[],
  email?: string,
  opts: Opts = {},
): Promise<TaskCtx> {
  const ctx = await appWithUser(email ?? 'p@example.com', opts)
  cleanups.push(ctx.stop)
  return ctx
}
