import fastifyCors from '@fastify/cors'
import fastifyRateLimit from '@fastify/rate-limit'
import type { FastifyInstance } from 'fastify'
import { sendProblem } from './problem'

const CSRF_HEADER = 'x-ctws-client'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export async function registerGuards(app: FastifyInstance): Promise<void> {
  // Registered first so its hook answers preflights and adds CORS headers
  // before the CSRF hook below ever runs.
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
  // OPTIONS must be exempt -- a preflight does not carry custom headers.
  // Blocking it would make every cross-origin write from a browser fail.
  app.addHook('onRequest', async (req, reply) => {
    if (SAFE_METHODS.has(req.method)) return
    if (req.headers[CSRF_HEADER]) return
    return sendProblem(reply, 403, `Missing ${CSRF_HEADER} header`)
  })
}
