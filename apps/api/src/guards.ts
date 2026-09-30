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

  // global: false -- only routes that declare `config.rateLimit` are limited.
  await app.register(fastifyRateLimit, {
    global: false,
    max: 20,
    timeWindow: '1 minute',
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
