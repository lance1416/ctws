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
import { registerUser } from '../auth/service'
import { getAdminUser, listUsers, updateUser } from './service'

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
      const { userId } = await registerUser(app.db, credentials, { explicitRole: role })
      const user = await getAdminUser(app.db, userId)
      if (!user) throw new Error('created user not found')
      return reply.status(201).send(user)
    },
  )

  typed.patch(
    '/admin/users/:id',
    {
      preHandler,
      schema: { params: adminUserParams, body: adminUpdateUserBody, response: { 200: adminUser } },
    },
    async (req, reply) => reply.send(await updateUser(app.db, req.params.id, req.body)),
  )
}
