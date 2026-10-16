import type { FastifyInstance, FastifyRequest, RouteShorthandOptions } from 'fastify'
import { ceiling } from '../../platform/http/guards'

/**
 * A bucket per email: behind a tunnel every request shares one IP. The same address in any case
 * or spacing is the same bucket, or the limit is trivially evaded.
 */
function byEmail(req: FastifyRequest): string {
  const body: unknown = req.body
  const email =
    body && typeof body === 'object' && 'email' in body && typeof body.email === 'string'
      ? body.email.trim().toLowerCase()
      : null
  return email && email.length > 0 ? `email:${email}` : `ip:${req.ip}`
}

/**
 * The limits on sign-in traffic: per email, plus one ceiling on the whole instance's, because
 * per-email buckets do not bound argon2 work across many addresses. A flood can refuse a real
 * sign-in for the rest of the minute, but nothing else slows. Make it once per app: the routes it
 * is spread on share the ceiling.
 */
export function signInLimits(app: FastifyInstance): RouteShorthandOptions {
  return {
    config: { rateLimit: { max: app.env.authRateLimitMax, keyGenerator: byEmail } },
    onRequest: ceiling(app, {
      max: app.env.authCeiling,
      windowMs: 60_000,
      detail: 'Too many sign-in attempts right now',
    }),
  }
}
