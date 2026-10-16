import { loginBody, registerBody, userResponse } from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { currentUser } from './authenticated'
import { clearSessionCookie, SESSION_COOKIE, setSessionCookie } from './cookie'
import { InvalidCredentialsError } from './errors'
import { authenticate, getAuthContext, loadUser, registerUser } from './service'
import { createSession, revokeSession } from './session'

/** Registration, sign-in and sign-out: reachable without a session. */
export const publicAuthRoutes: FastifyPluginAsyncZod = async (app) => {
  // The guards' per-email limit, plus the instance-wide ceiling on all sign-in traffic.
  const authLimit = { config: { rateLimit: {} }, onRequest: app.authCeiling }

  app.post(
    '/auth/register',
    { ...authLimit, schema: { body: registerBody, response: { 201: userResponse } } },
    async (req, reply) => {
      const { env, db } = app
      // Closed: only the first account gets through.
      const { userId, workspaceId, role } = await registerUser(db, req.body, {
        onlyIfFirst: env.authRegistration === 'closed',
      })
      const session = await createSession(db, userId, env.sessionTtlDays)
      setSessionCookie(reply, env, session.token, session.expiresAt)
      return reply.status(201).send({
        id: userId,
        email: req.body.email,
        timezone: req.body.timezone,
        workspaceId,
        role,
      })
    },
  )

  app.post(
    '/auth/login',
    { ...authLimit, schema: { body: loginBody, response: { 200: userResponse } } },
    async (req, reply) => {
      const { env, db } = app
      // An unknown email, a wrong password and a disabled account all read the same.
      const result = await authenticate(db, req.body.email, req.body.password)
      if (!result) throw new InvalidCredentialsError()
      // Everything a 200 needs is read before a session exists, so a refusal never leaves one.
      const ctx = await getAuthContext(db, result.userId)
      if (!ctx) throw new InvalidCredentialsError()
      const user = await loadUser(db, result.userId, ctx)

      const session = await createSession(db, result.userId, env.sessionTtlDays)
      setSessionCookie(reply, env, session.token, session.expiresAt)
      return reply.send(user)
    },
  )

  app.post('/auth/logout', { schema: { hide: true } }, async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE]
    if (token) await revokeSession(app.db, token)
    clearSessionCookie(reply, app.env)
    return reply.status(204).send()
  })
}

/** The signed-in account; registered inside the authenticated scope. */
export const sessionRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/auth/me', { schema: { response: { 200: userResponse } } }, async (req, reply) => {
    const { id, workspaceId, role, timezone } = currentUser(req)
    return reply.send(await loadUser(app.db, id, { workspaceId, role, timezone }))
  })
}
