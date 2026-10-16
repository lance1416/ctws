import { api } from '@ctws/contracts'
import type { FastifyInstance } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { on, serve } from '../../platform/http/serve'
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

  serve(app, [
    on(api.admin.listUsers, async () => ({ users: await listUsers(app.db) })),

    on(api.admin.createUser, async (req) => {
      const { role, ...credentials } = req.body
      const { userId } = await registerUser(app.db, credentials, {
        now: app.clock(),
        explicitRole: role,
      })
      return getAdminUser(app.db, userId)
    }),

    on(api.admin.updateUser, async (req) =>
      updateUser(app.db, req.params.id, req.body, app.clock()),
    ),
  ])
}
