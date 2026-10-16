import {
  adminCreateUserBody,
  adminUpdateUserBody,
  adminUser,
  adminUserListResponse,
  userParams,
} from '@ctws/contracts'
import type { FastifyInstance } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { currentUser } from '../auth/authenticated'
import { registerUser } from '../auth/service'
import { AdminRequiredError } from './errors'
import { getAdminUser, listUsers, updateUser } from './service'

/** Nested inside an `authenticated` scope: admin accounts only. */
function adminOnly(scope: FastifyInstance): void {
  scope.addHook('onRequest', async (req) => {
    if (currentUser(req).role !== 'admin') throw new AdminRequiredError()
  })
}

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
      const { userId } = await registerUser(app.db, credentials, {
        now: app.clock(),
        explicitRole: role,
      })
      return reply.status(201).send(await getAdminUser(app.db, userId))
    },
  )

  app.patch(
    '/admin/users/:id',
    {
      schema: { params: userParams, body: adminUpdateUserBody, response: { 200: adminUser } },
    },
    async (req, reply) =>
      reply.send(await updateUser(app.db, req.params.id, req.body, app.clock())),
  )
}
