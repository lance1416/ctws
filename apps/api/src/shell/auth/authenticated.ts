import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Actor } from '../../platform/db/scope'
import { SESSION_COOKIE, setSessionCookie } from './cookie'
import { SessionRequiredError } from './errors'
import type { Account } from './service'
import { findSessionAccount } from './session'

declare module 'fastify' {
  interface FastifyRequest {
    user: Account | null
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
    const session = token ? await findSessionAccount(scope.db, token, window) : null
    if (!token || !session) throw new SessionRequiredError()
    // The browser drops the cookie at its own expiry, so it slides with the session.
    if (session.renewedUntil) setSessionCookie(reply, scope.env, token, session.renewedUntil)
    req.user = session.account
  })
}

export function currentUser(req: FastifyRequest): Account {
  if (!req.user) throw new SessionRequiredError()
  return req.user
}

/** The signed-in workspace and the app clock's now, for a write. */
export function actorOf(req: FastifyRequest): Actor {
  return { workspaceId: currentUser(req).workspaceId, now: req.server.clock() }
}
