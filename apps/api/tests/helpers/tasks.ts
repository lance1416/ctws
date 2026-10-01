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
