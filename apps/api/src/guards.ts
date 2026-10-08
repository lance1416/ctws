import fastifyCors from '@fastify/cors'
import fastifyRateLimit from '@fastify/rate-limit'
import type { FastifyInstance, onRequestHookHandler } from 'fastify'
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
   * TWO BUCKETS, NOT ONE (D3). They stop different attacks and neither replaces the other.
   *
   * THIS ONE IS PER EMAIL. Behind a reverse proxy -- the planned deployment is a Cloudflare
   * Tunnel -- every request arrives from the proxy, so an IP-only key puts everybody in one
   * bucket and one person fat-fingering their password locks out the rest. The email is the
   * key that actually identifies the account under attack, and it is immune to the topology.
   * (`trustProxy` + `X-Forwarded-For` would give a correct per-user bucket and is forgeable by
   * anyone who can reach the API directly, so it would have to be pinned to the tunnel's CIDR
   * to be worth anything.)
   *
   * IT IS NOT ENOUGH ON ITS OWN, and the first version of this change shipped as though it
   * were. Per-email alone has no ceiling on the INSTANCE: an attacker with ten thousand
   * addresses gets ten thousand buckets from one connection, and `authenticate` runs argon2
   * against a dummy hash even for an address that does not exist (deliberately, to equalise
   * timing) -- so that is unbounded CPU. `IP_CEILING` below is the other half.
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

  /**
   * THE SECOND BUCKET: everything one CONNECTION can do to the auth routes, whatever addresses
   * it names. Higher than the per-email limit, because several tabs (or several people behind
   * one proxy) legitimately share an address, and finite, which is what the per-email bucket is
   * not.
   *
   * WRITTEN BY HAND, and that is a deviation worth justifying. `fastify-rate-limit` is already
   * here and does everything else; it does not do TWO limits on one route -- a second limiter
   * attached beside the route's own silently disables it (measured: all 25 attempts came back
   * 401 where the twenty-first should have been 429). A fixed window over a Map is twenty lines
   * for one self-hosted instance, and the alternative was a limit that looked present and was
   * not, which is the worse failure by a distance.
   *
   * Fixed window, not sliding: at the boundary an attacker gets 2x for one second. Against a
   * ceiling whose job is to bound argon2 on one box, that is noise.
   */
  const CEILING = app.env.authIpCeiling
  const WINDOW_MS = 60_000
  const seen = new Map<string, { count: number; until: number }>()
  app.decorate('authIpCeiling', (async (req, reply) => {
    const now = Date.now()
    // Opportunistic sweep: this runs only on auth requests, so the map never holds more than
    // the addresses that have tried to sign in during one window.
    for (const [k, v] of seen) if (v.until <= now) seen.delete(k)
    const bucket = seen.get(req.ip) ?? { count: 0, until: now + WINDOW_MS }
    bucket.count += 1
    seen.set(req.ip, bucket)
    if (bucket.count > CEILING) {
      return sendProblem(reply, 429, 'Too many requests from this address')
    }
  }) satisfies onRequestHookHandler)

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
