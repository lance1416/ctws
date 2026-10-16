import fastifyRateLimit from '@fastify/rate-limit'
import type { FastifyInstance, onRequestHookHandler } from 'fastify'
import { plainProblem, sendProblem } from './problem'

const CSRF_HEADER = 'x-ctws-client'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function requiresCsrfHeader(method: string): boolean {
  return !SAFE_METHODS.has(method)
}

export async function registerGuards(app: FastifyInstance): Promise<void> {
  /**
   * Only routes that declare `config.rateLimit` are limited, each saying how. Limits are checked
   * once the body is parsed, so a route can key its bucket by what the body names.
   */
  await app.register(fastifyRateLimit, {
    global: false,
    timeWindow: '1 minute',
    hook: 'preValidation',
  })

  // CSRF: a browser cannot send a custom header cross-origin without a preflight, and no origin
  // is allowed one.
  app.addHook('onRequest', async (req, reply) => {
    if (!requiresCsrfHeader(req.method)) return
    if (req.headers[CSRF_HEADER]) return
    return sendProblem(reply, plainProblem(403, `Missing ${CSRF_HEADER} header`))
  })
}

/**
 * One counter, with no key, for every request through the routes that share the hook: nothing to
 * rotate past, and no map to grow. Past `max` in a window the rest of the window is refused.
 */
export function ceiling(
  app: FastifyInstance,
  { max, windowMs, detail }: { max: number; windowMs: number; detail: string },
): onRequestHookHandler {
  let window = { count: 0, until: 0 }
  return async (_req, reply) => {
    const now = app.clock().getTime()
    if (now >= window.until) window = { count: 0, until: now + windowMs }
    window.count += 1
    if (window.count <= max) return
    return sendProblem(reply, plainProblem(429, detail))
  }
}
