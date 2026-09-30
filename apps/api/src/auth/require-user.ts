import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify'
import { sendProblem } from '../problem'
import { SESSION_COOKIE } from './cookie'
import { getWorkspaceIdForUser } from './service'
import { findValidSession } from './session'

export type AuthedUser = { id: string; workspaceId: string }

// A request that has already passed through `requireUser`. `user` is
// required here (unlike the optional `FastifyRequest.user` below), so
// handlers registered with `requireUser` as their preHandler can use
// `authedUser(req)` once instead of repeating `req.user!` at every call
// site -- see Fix round 1.
export type AuthedRequest = FastifyRequest & { user: AuthedUser }

// Narrows a request to `AuthedRequest`. Only call this from a handler whose
// route registers `requireUser` as a preHandler -- that is what guarantees
// `req.user` is populated. The single `!` this centralises would otherwise
// be duplicated at every authenticated route.
export function authedUser(req: FastifyRequest): AuthedUser {
  return (req as AuthedRequest).user!
}

// Must stay a `function` declaration, not an arrow function: Fastify binds
// `this` to the calling FastifyInstance for preHandler hooks declared this
// way, and `this.db` below relies on that binding. An arrow function would
// capture the lexical `this` (undefined at the module top level) instead,
// and `this.db` would throw. Keeping it a plain function (rather than
// restructuring into an app/db factory) matches how Task 5/6 hooks are
// already written in this codebase.
export const requireUser: preHandlerAsyncHookHandler = async function (req, reply) {
  const id = req.cookies[SESSION_COOKIE]
  if (!id) return sendProblem(reply, 401, 'Authentication required')

  const session = await findValidSession(this.db, id)
  if (!session) return sendProblem(reply, 401, 'Authentication required')

  // Workspace scoping is injected here, once, so route handlers never need
  // to remember to scope their own queries -- see design spec §10.5. The
  // actual membership lookup lives in service.ts so both this preHandler
  // and the login route share one implementation.
  const workspaceId = await getWorkspaceIdForUser(this.db, session.userId)
  if (!workspaceId) return sendProblem(reply, 401, 'Authentication required')

  req.user = { id: session.userId, workspaceId }
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: string; workspaceId: string }
  }
}
