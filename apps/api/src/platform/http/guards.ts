import fastifyRateLimit from '@fastify/rate-limit'
import type { FastifyInstance, onRequestHookHandler } from 'fastify'
import { sendProblem } from './problem'

const CSRF_HEADER = 'x-ctws-client'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const CEILING_WINDOW_MS = 60_000

export function requiresCsrfHeader(method: string): boolean {
  return !SAFE_METHODS.has(method)
}

export async function registerGuards(app: FastifyInstance): Promise<void> {
  /**
   * Routes that declare `config.rateLimit` are limited per email: behind a tunnel every request
   * shares one IP. The email is in the body, so the key is read after parsing.
   */
  await app.register(fastifyRateLimit, {
    global: false,
    max: app.env.authRateLimitMax,
    timeWindow: '1 minute',
    hook: 'preValidation',
    keyGenerator: (req) => {
      const body: unknown = req.body
      const email =
        body && typeof body === 'object' && 'email' in body && typeof body.email === 'string'
          ? body.email.trim().toLowerCase()
          : null
      return email && email.length > 0 ? `email:${email}` : `ip:${req.ip}`
    },
  })

  /**
   * One counter for the whole instance's sign-in traffic: per-email buckets do not bound argon2
   * work across many addresses, and per-address buckets would grow without bound. A flood can
   * refuse a real sign-in for the rest of the minute, but nothing else slows.
   */
  let window = { count: 0, until: 0 }
  app.decorate('authCeiling', (async (_req, reply) => {
    const now = Date.now()
    if (now >= window.until) window = { count: 0, until: now + CEILING_WINDOW_MS }
    window.count += 1
    if (window.count > app.env.authCeiling) {
      return sendProblem(reply, 429, 'Too many sign-in attempts right now')
    }
  }) satisfies onRequestHookHandler)

  // CSRF: a browser cannot send a custom header cross-origin without a preflight, and no origin
  // is allowed one.
  app.addHook('onRequest', async (req, reply) => {
    if (!requiresCsrfHeader(req.method)) return
    if (req.headers[CSRF_HEADER]) return
    return sendProblem(reply, 403, `Missing ${CSRF_HEADER} header`)
  })
}
