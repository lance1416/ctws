import { registerBody, userResponse } from '@ctws/contracts'
import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { sendProblem } from '../problem'
import { setSessionCookie } from './cookie'
import { createSession } from './session'
import { EmailTakenError, registerUser } from './service'

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
}
