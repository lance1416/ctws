import {
  adminCreateUserBody,
  adminUpdateUserBody,
  adminUser,
  adminUserListResponse,
  idParams,
} from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { adminOnly } from '../auth/authenticated'
import { registerUser } from '../auth/service'
import { getAdminUser, listUsers, updateUser } from './service'

// Account management only. Nothing here reads or writes workspace content: an instance admin
// administers accounts, it does not gain access to other users' data.
export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  adminOnly(app)

  app.get(
    '/admin/users',
    { schema: { response: { 200: adminUserListResponse } } },
    async (_req, reply) => reply.send({ users: await listUsers(app.db) }),
  )

  app.post(
    '/admin/users',
    { schema: { body: adminCreateUserBody, response: { 201: adminUser } } },
    async (req, reply) => {
      const { role, ...credentials } = req.body
      const { userId } = await registerUser(app.db, credentials, { explicitRole: role })
      return reply.status(201).send(await getAdminUser(app.db, userId))
    },
  )

  app.patch(
    '/admin/users/:id',
    {
      schema: { params: idParams, body: adminUpdateUserBody, response: { 200: adminUser } },
    },
    async (req, reply) => reply.send(await updateUser(app.db, req.params.id, req.body)),
  )
}
