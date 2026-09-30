import { loginBody, registerBody, userResponse } from '@ctws/contracts'
import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { sendProblem } from '../problem'
import { clearSessionCookie, SESSION_COOKIE, setSessionCookie } from './cookie'
import { requireUser } from './require-user'
import { createSession, revokeSession } from './session'
import {
  authenticate,
  EmailTakenError,
  getWorkspaceIdForUser,
  loadUser,
  registerUser,
} from './service'

export const authRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>()

  typed.post(
    '/auth/register',
    { schema: { body: registerBody, response: { 201: userResponse } } },
    async (req, reply) => {
      const { env, db } = app
      if (env.authRegistration === 'closed') {
        return sendProblem(reply, 403, 'Registration is closed')
      }
      if (env.authRegistration === 'invite' && req.body.inviteCode !== env.authInviteCode) {
        return sendProblem(reply, 403, 'A valid invite code is required')
      }

      try {
        const { userId, workspaceId } = await registerUser(db, req.body)
        const session = await createSession(db, userId, env.sessionTtlDays)
        setSessionCookie(reply, env, session.id, session.expiresAt)
        return reply.status(201).send({
          id: userId,
          email: req.body.email,
          timezone: req.body.timezone,
          workspaceId,
        })
      } catch (error) {
        if (error instanceof EmailTakenError) {
          return sendProblem(reply, 409, 'That email is already registered')
        }
        throw error
      }
    },
  )

  typed.post(
    '/auth/login',
    { schema: { body: loginBody, response: { 200: userResponse } } },
    async (req, reply) => {
      const { env, db } = app
      const result = await authenticate(db, req.body.email, req.body.password)
      // Same status and title as an unknown email -- see authenticate().
      if (!result) return sendProblem(reply, 401, 'Invalid email or password')

      const session = await createSession(db, result.userId, env.sessionTtlDays)
      setSessionCookie(reply, env, session.id, session.expiresAt)

      const workspaceId = await getWorkspaceIdForUser(db, result.userId)
      if (!workspaceId) return sendProblem(reply, 401, 'Invalid email or password')

      const user = await loadUser(db, result.userId, workspaceId)
      if (!user) return sendProblem(reply, 401, 'Invalid email or password')
      return reply.send(user)
    },
  )

  typed.get(
    '/auth/me',
    { preHandler: requireUser, schema: { response: { 200: userResponse } } },
    async (req, reply) => {
      const user = await loadUser(app.db, req.user!.id, req.user!.workspaceId)
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
