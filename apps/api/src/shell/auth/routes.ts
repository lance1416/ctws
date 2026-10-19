import { api } from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { on, serve } from '../../platform/http/serve'
import { currentUser } from './authenticated'
import { clearSessionCookie, SESSION_COOKIE, setSessionCookie } from './cookie'
import { InvalidCredentialsError } from './errors'
import { signInLimits } from './limits'
import { authenticate, loadAccount, registerUser } from './service'
import { createSession, revokeSession } from './session'

/** Registration, sign-in and sign-out: reachable without a session. */
export const publicAuthRoutes: FastifyPluginAsyncZod = async (app) => {
  const authLimit = signInLimits(app)

  serve(app, [
    on(
      api.auth.register,
      async (req, reply) => {
        const { env, db } = app
        // Closed: only the first account gets through.
        const { userId, workspaceId, role } = await registerUser(db, req.body, {
          now: app.clock(),
          onlyIfFirst: env.authRegistration === 'closed',
        })
        const session = await createSession(db, userId, {
          ttlDays: env.sessionTtlDays,
          now: app.clock(),
        })
        setSessionCookie(reply, env, session.token, session.expiresAt)
        return {
          id: userId,
          email: req.body.email,
          timezone: req.body.timezone,
          workspaceId,
          role,
        }
      },
      authLimit,
    ),

    on(
      api.auth.login,
      async (req, reply) => {
        const { env, db } = app
        // An unknown email, a wrong password and a disabled account all read the same.
        const result = await authenticate(db, req.body.email, req.body.password)
        if (!result) throw new InvalidCredentialsError()
        // Everything a 200 needs is read before a session exists, so a refusal never leaves one.
        const user = await loadAccount(db, result.userId)
        if (!user) throw new InvalidCredentialsError()

        const session = await createSession(db, result.userId, {
          ttlDays: env.sessionTtlDays,
          now: app.clock(),
        })
        setSessionCookie(reply, env, session.token, session.expiresAt)
        return user
      },
      authLimit,
    ),

    on(api.auth.logout, async (req, reply) => {
      const token = req.cookies[SESSION_COOKIE]
      if (token) await revokeSession(app.db, token)
      clearSessionCookie(reply, app.env)
    }),
  ])
}

/** The signed-in account; registered inside the authenticated scope. */
export const sessionRoutes: FastifyPluginAsyncZod = async (app) => {
  serve(app, [
    // Read already, with the session that let the request in.
    on(api.auth.me, async (req) => ({
      ...currentUser(req),
      now: app.clock().toISOString(),
      clockPinned: app.env.clockPinnedAt !== undefined,
    })),
  ])
}
