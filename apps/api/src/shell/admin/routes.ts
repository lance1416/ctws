import {
  adminCreateUserBody,
  adminUpdateUserBody,
  adminUser,
  adminUserListResponse,
  adminUserParams,
} from '@ctws/contracts'
import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { requireAdmin, requireUser } from '../auth/require-user'
import { EmailTakenError, registerUser } from '../auth/service'
import { sendProblem } from '../../platform/http/problem'
import { getAdminUser, LastAdminError, listUsers, updateUser, UserNotFoundError } from './service'

// Account management only. Nothing here reads or writes workspace content: an instance admin
// administers accounts, it does not gain access to other users' data.
export const adminRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>()
  const preHandler = [requireUser, requireAdmin]

  typed.get(
    '/admin/users',
    { preHandler, schema: { response: { 200: adminUserListResponse } } },
    async (_req, reply) => reply.send({ users: await listUsers(app.db) }),
  )

  typed.post(
    '/admin/users',
    { preHandler, schema: { body: adminCreateUserBody, response: { 201: adminUser } } },
    async (req, reply) => {
      const { role, ...credentials } = req.body
      try {
        const { userId } = await registerUser(app.db, credentials, { explicitRole: role })
        const user = await getAdminUser(app.db, userId)
        if (!user) throw new Error('created user not found')
        return reply.status(201).send(user)
      } catch (error) {
        if (error instanceof EmailTakenError) {
          return sendProblem(reply, 409, 'That email is already registered')
        }
        throw error
      }
    },
  )

  typed.patch(
    '/admin/users/:id',
    {
      preHandler,
      schema: { params: adminUserParams, body: adminUpdateUserBody, response: { 200: adminUser } },
    },
    async (req, reply) => {
      try {
        return reply.send(await updateUser(app.db, req.params.id, req.body))
      } catch (error) {
        if (error instanceof UserNotFoundError) return sendProblem(reply, 404, 'User not found')
        if (error instanceof LastAdminError) {
          return sendProblem(reply, 409, 'At least one enabled admin must remain')
        }
        throw error
      }
    },
  )
}
