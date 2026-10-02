import { sql } from 'drizzle-orm'
import { expect } from 'vitest'
import { LOCK_TASK_TREE } from '../../src/tasks/tasks'
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
export async function appWithUser(email = 'p@example.com'): Promise<TaskCtx> {
  const ctx = await withApp({ authRegistration: 'open' })
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers: clientHeader,
    payload: { email, password: 'correct horse battery', timezone: 'UTC' },
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
    url: `/api/v1/projects/${projectId}/tasks`,
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
 * Fires a request while LOCK_TASK_TREE is held on another transaction, asserts the request is
 * still in flight after a moment, then releases the lock and returns the response.
 *
 * This is a MECHANISM test, not a race test. Reproducing the interleaving the lock prevents needs
 * a pause point inside the service transaction -- a hook in production code -- and an attempt at
 * it without one passed with the lock removed, which is the definition of a vacuous test. Holding
 * the lock from outside instead is deterministic in the safe direction: a blocked request stays
 * blocked indefinitely, so the wait cannot end early by luck; it could only ever be too short,
 * and an unblocked request finishes in single-digit milliseconds.
 *
 * What it does NOT prove is where in the transaction the lock is taken. A caller that took it last
 * would contend identically here and be useless, so "first statement" rests on the comments in the
 * services, not on this helper.
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
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_TASK_TREE}, hashtext(${workspaceId}))`)
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
