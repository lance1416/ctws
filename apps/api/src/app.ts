import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import fastifyCookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import fastifySwagger from '@fastify/swagger'
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type onRequestHookHandler,
} from 'fastify'
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { adminRoutes } from './admin/routes'
import { authRoutes } from './auth/routes'
import { movedRoutes } from './compat'
import { warmDummyHash } from './auth/service'
import type { Db } from './db/client'
import type { Env } from './env'
import { documentRefusals } from './openapi'
import { calendarDayRoutes } from './calendar/days'
import { registerGuards } from './guards'
import { linkRoutes } from './links/routes'
import { sendProblem } from './problem'
import { unfurl, type Unfurl } from './reading/unfurl'
import { projectRoutes } from './projects/routes'
import { cityRoutes } from './cities/routes'
import { contactRoutes } from './contacts/routes'
import { meetingRoutes } from './meetings/routes'
import { readingRoutes } from './reading/routes'
import { taskRoutes } from './tasks/routes'

/**
 * `unfurl` 可以换掉：测试里的服务器住在 127.0.0.1 上，而那正是线上要挡的地址。生产这条路上没有
 * 任何开关 —— 整个关掉是 env 的事（`READING_UNFURL`），不是把那道门放开。
 */
export async function buildApp(opts: {
  env: Env
  db: Db
  unfurl?: Unfurl
}): Promise<FastifyInstance> {
  // Resolve the login timing-equalisation hash before the app is ready, so
  // the very first login request -- known or unknown email -- never pays
  // for hashing it. See auth/service.ts `warmDummyHash`.
  await warmDummyHash()

  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.decorate('db', opts.db)
  app.decorate('env', opts.env)
  app.decorate('unfurl', opts.unfurl ?? unfurl)

  await app.register(fastifySwagger, {
    openapi: { info: { title: 'CTWS API', version: '1' } },
    transform: jsonSchemaTransform,
    // Every refusal this API makes is one shape, so the document says it ONCE and every
    // operation points at it. Written as a post-pass rather than on each route: the statuses
    // below are true of every route by construction (the auth hook, the validator, the
    // limiter), and repeating them on forty routes is forty chances to leave one out.
    transformObject: (spec) => documentRefusals(jsonSchemaTransformObject(spec)),
  })

  // CORS, CSRF and rate limiting; must precede the routes they guard.
  await registerGuards(app)

  // Must be registered before the auth routes so `reply.setCookie` /
  // `reply.clearCookie` are available inside them.
  await app.register(fastifyCookie)

  app.setErrorHandler((error: FastifyError, _req, reply) => {
    // The zod type provider raises validation failures as a Fastify error carrying Zod
    // issues in `error.validation` -- these are client errors (bad request bodies/params)
    // and must map to 400, not the generic 500 path below.
    if (hasZodFastifySchemaValidationErrors(error)) {
      sendProblem(reply, 400, 'Bad Request', error.message)
      return
    }

    const status = error.statusCode ?? 500

    if (status >= 500) {
      // Never leak internal error text or stack traces for server errors.
      sendProblem(reply, status, 'Internal Server Error')
      return
    }

    sendProblem(reply, status, error.message)
  })

  app.get('/api/v1/health', { schema: { hide: true } }, async () => ({ status: 'ok' }))

  app.get('/api/v1/openapi.json', { schema: { hide: true } }, async () => app.swagger())

  await app.register(authRoutes, { prefix: '/api/v1' })
  // The shell's own surfaces stay flat under /api/v1; a MODULE gets a namespace of its own, so
  // the second module can be added without either one having to know the other's paths.
  await app.register(projectRoutes, { prefix: '/api/v1' })
  await app.register(adminRoutes, { prefix: '/api/v1' })
  // The edge table is the shell's, like projects: an edge joins two modules' things, so no
  // module could own it without learning about another.
  await app.register(linkRoutes, { prefix: '/api/v1' })
  await app.register(calendarDayRoutes, { prefix: '/api/v1' })
  await app.register(cityRoutes, { prefix: '/api/v1' })
  await app.register(taskRoutes, { prefix: '/api/v1/tasks' })
  await app.register(readingRoutes, { prefix: '/api/v1/reading' })
  await app.register(contactRoutes, { prefix: '/api/v1/contacts' })
  await app.register(meetingRoutes, { prefix: '/api/v1/meetings' })
  // Registered last: a legacy path must never shadow a real one.
  await app.register(movedRoutes, { prefix: '/api/v1' })

  // Serve the built web app, if configured. Registered after the API routes on purpose: API
  // routes must win over static files, and anything that misses falls to the not-found handler.
  const webDist = opts.env.webDist && existsSync(opts.env.webDist) ? opts.env.webDist : undefined
  if (webDist)
    await app.register(fastifyStatic, {
      root: resolve(webDist),
      // Two different caching rules, and the distinction is the whole point:
      //
      // `/assets/*` is Vite's output and every filename in it carries a content hash, so a file at
      // a given URL can never change. It gets a year and `immutable`, which means the browser does
      // not even revalidate. Without this the server answered `max-age=0` for everything and the
      // webfonts came back 200 with full bodies on EVERY navigation -- 1.8 MiB of CJK font
      // re-downloaded twenty times a day. `immutable` on hashed assets is what makes a self-hosted
      // webfont a one-time cost instead of a per-load one.
      //
      // `index.html` (and anything else unhashed) must NOT be cached that way: its URL never
      // changes, so an immutable copy would pin the browser to the deployed-before version for a
      // year and no deploy would ever be picked up. It gets `no-cache`, which still allows a
      // conditional request and a cheap 304 -- it means "revalidate", not "do not store".
      cacheControl: false,
      setHeaders(reply, path) {
        const hashed = /[/\\]assets[/\\]/.test(path)
        reply.header('cache-control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache')
      },
    })

  app.setNotFoundHandler((req, reply) => {
    // Browser navigations to client-side routes get the SPA shell; API paths keep their 404.
    const navigation = req.method === 'GET' && (req.headers.accept ?? '').includes('text/html')
    if (webDist && navigation && !req.url.startsWith('/api/')) return reply.sendFile('index.html')
    return sendProblem(reply, 404, 'Not Found')
  })

  return app
}

declare module 'fastify' {
  interface FastifyInstance {
    db: Db
    env: Env
    /** 去读一条链接对面说的那句话；见 reading/unfurl.ts。 */
    unfurl: Unfurl
    /** The instance-wide ceiling on auth traffic; see guards.ts. */
    authCeiling: onRequestHookHandler
  }
}
