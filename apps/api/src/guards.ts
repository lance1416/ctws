import type { Problem } from '@ctws/contracts'
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
   * EVERY REFUSAL IS RFC 9457, including the ones a plugin writes itself.
   *
   * `@fastify/cors` answers a malformed preflight -- an OPTIONS with no
   * `Access-Control-Request-Method` -- from inside its own hook, with
   * `400 text/plain: Invalid Preflight Request`. It never reaches the error handler, so it was
   * the one error in this API a client could not parse the way it parses every other one.
   *
   * Rewritten on the way OUT rather than by relaxing the plugin: a preflight without a method is
   * malformed and 400 is the right answer. Only the envelope was wrong.
   */
  app.addHook('onSend', async (_req, reply, payload) => {
    const type = reply.getHeader('content-type')
    if (reply.statusCode < 400 || typeof type !== 'string' || !type.startsWith('text/plain')) {
      return payload
    }
    reply.type('application/problem+json')
    const problem: Problem = {
      type: 'about:blank',
      title: reply.statusCode === 400 ? 'Bad Request' : 'Error',
      status: reply.statusCode,
      ...(typeof payload === 'string' && payload ? { detail: payload } : {}),
    }
    return JSON.stringify(problem)
  })

  /**
   * global: false -- only routes that declare `config.rateLimit` are limited.
   *
   * TWO BUCKETS, NOT ONE. They stop different attacks and neither replaces the other.
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
   * THE SECOND LIMIT: a CEILING ON THE WHOLE INSTANCE's auth traffic, per minute.
   *
   * WHAT IT IS FOR, exactly: `authenticate` runs argon2 even for an address that does not exist
   * (deliberately, to equalise timing), so every auth request costs real CPU. The per-email
   * bucket above cannot bound that -- ten thousand addresses are ten thousand buckets.
   *
   * NOT PER IP, and that is the correction. The first version of this kept a Map keyed by
   * `req.ip` and swept it on every request: an attacker rotating source addresses (an IPv6 /64
   * is billions) grows that map without bound and makes the sweep O(n) per request, so the
   * limiter becomes the amplifier. A single counter has no key to rotate, no table to grow and
   * nothing to sweep.
   *
   * THE TRADE, stated plainly: a flood can exhaust this ceiling and the legitimate user is
   * refused a sign-in for the rest of the minute. That is the same outcome as the unbounded
   * version -- the box is under attack either way -- except that here everything which is not
   * the auth routes stays responsive. A per-address version would also have to decide what to
   * do with a full table, and every answer to that is this trade under another name.
   *
   * Fixed window, not sliding: at a boundary an attacker gets 2x for one second, which against
   * a CPU ceiling is noise.
   */
  const CEILING = app.env.authCeiling
  const WINDOW_MS = 60_000
  let window = { count: 0, until: 0 }
  app.decorate('authCeiling', (async (_req, reply) => {
    const now = Date.now()
    if (now >= window.until) window = { count: 0, until: now + WINDOW_MS }
    window.count += 1
    if (window.count > CEILING) {
      return sendProblem(reply, 429, 'Too many sign-in attempts right now')
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
