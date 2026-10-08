import fastifyCors from '@fastify/cors'
import fastifyRateLimit from '@fastify/rate-limit'
import type { FastifyInstance } from 'fastify'
import { sendProblem } from './problem'

const CSRF_HEADER = 'x-ctws-client'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// OPTIONS must stay exempt -- a preflight does not carry custom headers.
export function requiresCsrfHeader(method: string): boolean {
  return !SAFE_METHODS.has(method)
}

export async function registerGuards(app: FastifyInstance): Promise<void> {
  // ORDER MATTERS: CORS must be registered before the CSRF hook below. Its
  // onRequest hook answers every OPTIONS request itself (a bare OPTIONS gets
  // 400 'Invalid Preflight Request') and adds CORS headers, so preflights never
  // reach the CSRF hook. Reordering these two breaks every cross-origin browser
  // write, and the failure surfaces as a CORS error, not a CSRF one.
  await app.register(fastifyCors, {
    origin: app.env.corsOrigins,
    credentials: true,
    allowedHeaders: ['content-type', CSRF_HEADER],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  /**
   * global: false -- only routes that declare `config.rateLimit` are limited.
   *
   * KEYED BY EMAIL, NOT BY IP (D3). Behind a reverse proxy -- which is the planned deployment,
   * a Cloudflare Tunnel -- every request arrives from the proxy, so an IP key puts the whole
   * world in one 20-a-minute bucket: one person fat-fingering their password locks out
   * everyone, and an attacker spreads a credential-stuffing run across a thousand accounts
   * inside one bucket without noticing it.
   *
   * The alternative was `trustProxy` plus `X-Forwarded-For`, which gives a correct per-user
   * bucket AND is forgeable by anyone who can reach the API directly -- it would have to be
   * pinned to the tunnel's CIDR to be worth anything. The email is not forgeable in the way
   * that matters: a stuffing run has to send the account it is attacking, so keying on it is a
   * better control for the attack this limit exists to stop, and it is immune to the topology.
   *
   * A body without a usable email falls back to the IP: a malformed request still costs
   * something, and the schema rejects it a moment later anyway.
   */
  await app.register(fastifyRateLimit, {
    global: false,
    max: 20,
    timeWindow: '1 minute',
    // `preValidation`, not the default `onRequest`: the key is in the BODY, and on `onRequest`
    // the body has not been parsed yet -- `req.body` is undefined and every request falls back
    // to the IP, which is the bug this change exists to fix and which is invisible unless a test
    // sends two different emails. The cost is that a throttled request is parsed before it is
    // refused; that is JSON parsing against argon2, which is what actually had to be protected.
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

  // CSRF: require a custom header on unsafe methods. A browser cannot send a
  // custom header cross-origin without a preflight, and the preflight is
  // gated by the CORS allowlist.
  //
  // Blocking OPTIONS here would make every cross-origin write from a browser
  // fail (see requiresCsrfHeader).
  app.addHook('onRequest', async (req, reply) => {
    if (!requiresCsrfHeader(req.method)) return
    if (req.headers[CSRF_HEADER]) return
    return sendProblem(reply, 403, `Missing ${CSRF_HEADER} header`)
  })
}
