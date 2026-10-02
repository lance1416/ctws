import { loginBody, registerBody, userResponse } from '@ctws/contracts'
import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { sendProblem } from '../problem'
import { clearSessionCookie, SESSION_COOKIE, setSessionCookie } from './cookie'
import { authedUser, requireUser } from './require-user'
import { createSession, revokeSession } from './session'
import {
  authenticate,
  EmailTakenError,
  getAuthContext,
  loadUser,
  RegistrationClosedError,
  registerUser,
} from './service'

export const authRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>()

  typed.post(
    '/auth/register',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: { body: registerBody, response: { 201: userResponse } },
    },
    async (req, reply) => {
      const { env, db } = app
      // Closed, or invite-only without a matching code: refused unless the users table is empty,
      // so a fresh instance can always create its first account (which becomes admin). The
      // emptiness check runs inside registerUser's transaction.
      const openToAll =
        env.authRegistration === 'open' ||
        (env.authRegistration === 'invite' && req.body.inviteCode === env.authInviteCode)

      try {
        const { userId, workspaceId } = await registerUser(db, req.body, {
          onlyIfFirst: !openToAll,
        })
        const ctx = await getAuthContext(db, userId)
        if (!ctx) throw new Error('freshly registered user has no auth context')
        const session = await createSession(db, userId, env.sessionTtlDays)
        setSessionCookie(reply, env, session.id, session.expiresAt)
        return reply.status(201).send({
          id: userId,
          email: req.body.email,
          timezone: req.body.timezone,
          workspaceId,
          role: ctx.role,
        })
      } catch (error) {
        if (error instanceof RegistrationClosedError) {
          return sendProblem(
            reply,
            403,
            env.authRegistration === 'invite'
              ? 'A valid invite code is required'
              : 'Registration is closed',
          )
        }
        if (error instanceof EmailTakenError) {
          return sendProblem(reply, 409, 'That email is already registered')
        }
        throw error
      }
    },
  )

  typed.post(
    '/auth/login',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: { body: loginBody, response: { 200: userResponse } },
    },
    async (req, reply) => {
      const { env, db } = app
      const result = await authenticate(db, req.body.email, req.body.password)
      // Same status and title as an unknown email -- see authenticate().
      if (!result) return sendProblem(reply, 401, 'Invalid email or password')

      // Resolve everything needed for a 200 BEFORE minting a session or
      // setting the cookie. A session must never be created, and a cookie
      // must never be handed out, for a request we are about to reject --
      // otherwise a caller who gets a 401 here would still be left holding
      // a live, usable session (see Fix round 1, Important #1).
      // Also null for a disabled user: refuse the login rather than mint a dead session.
      const ctx = await getAuthContext(db, result.userId)
      if (!ctx) return sendProblem(reply, 401, 'Invalid email or password')

      const user = await loadUser(db, result.userId, ctx)
      if (!user) return sendProblem(reply, 401, 'Invalid email or password')

      const session = await createSession(db, result.userId, env.sessionTtlDays)
      setSessionCookie(reply, env, session.id, session.expiresAt)
      return reply.send(user)
    },
  )

  typed.get(
    '/auth/me',
    { preHandler: requireUser, schema: { response: { 200: userResponse } } },
    async (req, reply) => {
      const { id, workspaceId, role, timezone } = authedUser(req)
      const user = await loadUser(app.db, id, { workspaceId, role, timezone })
      if (!user) return sendProblem(reply, 401, 'Authentication required')
      return reply.send(user)
    },
  )

  typed.post('/auth/logout', { schema: { hide: true } }, async (req, reply) => {
    const id = req.cookies[SESSION_COOKIE]
    if (id) await revokeSession(app.db, id)
    clearSessionCookie(reply, app.env)
    return reply.status(204).send()
  })
}
