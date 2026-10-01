import { sql } from 'drizzle-orm'
import { withApp } from './app'

export type TaskCtx = Awaited<ReturnType<typeof withApp>> & {
  cookie: string
  authed: Record<string, string>
}

const clientHeader = { 'x-ctws-client': 'web' }

/**
 * Boots an app with open registration and registers one user. The caller owns `ctx.stop()`.
 * `authed` is a ready-to-use header bag carrying the session cookie.
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
