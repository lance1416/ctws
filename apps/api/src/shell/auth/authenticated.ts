import { type Role, type UserId, type WorkspaceId } from '@ctws/contracts'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Actor } from '../../platform/db/scope'
import { AdminRequiredError } from '../admin/errors'
import { SESSION_COOKIE, setSessionCookie } from './cookie'
import { SessionRequiredError } from './errors'
import { getAuthContext } from './service'
import { findValidSession } from './session'

type CurrentUser = { id: UserId; workspaceId: WorkspaceId; role: Role; timezone: string }

declare module 'fastify' {
  interface FastifyRequest {
    user: CurrentUser | null
  }
}

/** Every route registered in `scope` needs a live session. Call before registering routes. */
export function authenticated(scope: FastifyInstance): void {
  scope.decorateRequest('user', null)
  scope.addHook('onRoute', (route) => {
    route.schema = { ...route.schema, security: [{ session: [] }] }
  })
  scope.addHook('onRequest', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE]
    const window = { ttlDays: scope.env.sessionTtlDays, now: scope.clock() }
    const session = token ? await findValidSession(scope.db, token, window) : null
    // Read on every request, so disabling or demoting an account applies at once.
    const context = session ? await getAuthContext(scope.db, session.userId) : null
    if (!token || !session || !context) throw new SessionRequiredError()
    // The browser drops the cookie at its own expiry, so it slides with the session.
    if (session.renewedUntil) setSessionCookie(reply, scope.env, token, session.renewedUntil)
    req.user = { id: session.userId, ...context }
  })
}

/** Nested inside an `authenticated` scope: admin accounts only. */
export function adminOnly(scope: FastifyInstance): void {
  scope.addHook('onRequest', async (req) => {
    if (currentUser(req).role !== 'admin') throw new AdminRequiredError()
  })
}

export function currentUser(req: FastifyRequest): CurrentUser {
  if (!req.user) throw new SessionRequiredError()
  return req.user
}

/** The signed-in workspace and the app clock's now, for a write. */
export function actorOf(req: FastifyRequest): Actor {
  return { workspaceId: currentUser(req).workspaceId, now: req.server.clock() }
}
