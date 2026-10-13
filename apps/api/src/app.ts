import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import fastifyCookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import fastifySwagger from '@fastify/swagger'
import Fastify, { type FastifyInstance, type onRequestHookHandler } from 'fastify'
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { adminRoutes } from './shell/admin/routes'
import { authenticated } from './shell/auth/authenticated'
import { SESSION_COOKIE } from './shell/auth/cookie'
import { publicAuthRoutes, sessionRoutes } from './shell/auth/routes'
import { warmDummyHash } from './shell/auth/service'
import type { Db } from './platform/db/client'
import type { Env } from './platform/config'
import { documentRefusals } from './platform/http/openapi'
import { calendarDayRoutes } from './shell/calendar/routes'
import { registerGuards } from './platform/http/guards'
import { linkRoutes } from './shell/links/routes'
import { handleError } from './platform/http/errors'
import { sendProblem } from './platform/http/problem'
import { apiModules } from './modules'
import { unfurl, type Unfurl } from './modules/reading'
import { linkRegistry } from './shell/links/registry'
import { projectLinkable } from './shell/projects/linkable'
import { projectRoutes } from './shell/projects/routes'
import { cityRoutes } from './shell/cities/routes'

/** `unfurl` and `clock` are replaceable for tests; production uses the defaults. */
export async function buildApp(opts: {
  env: Env
  db: Db
  unfurl?: Unfurl
  clock?: () => Date
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
  app.decorate('clock', opts.clock ?? (() => new Date()))

  await app.register(fastifySwagger, {
    openapi: {
      info: { title: 'CTWS API', version: '1' },
      components: {
        securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE } },
      },
    },
    transform: (input) => {
      const out = jsonSchemaTransform(input)
      // Carried to the operation so the refusal pass can add a 429.
      return input.route.config?.rateLimit
        ? { ...out, schema: { ...out.schema, 'x-rate-limited': true } }
        : out
    },
    transformObject: (spec) => documentRefusals(jsonSchemaTransformObject(spec)),
  })

  // CORS, CSRF and rate limiting; must precede the routes they guard.
  await registerGuards(app)

  // Must be registered before the auth routes so `reply.setCookie` /
  // `reply.clearCookie` are available inside them.
  await app.register(fastifyCookie)

  app.setErrorHandler(handleError)

  app.get('/api/v1/health', { schema: { hide: true } }, async () => ({ status: 'ok' }))

  app.get('/api/v1/openapi.json', { schema: { hide: true } }, async () => app.swagger())

  const modules = apiModules({
    unfurl: opts.unfurl ?? unfurl,
    unfurlEnabled: opts.env.readingUnfurl,
  })
  const registry = linkRegistry([...modules.map((m) => m.linkable), projectLinkable])
  const columns = Object.assign({}, ...modules.map((m) => m.projectColumns ?? {}))

  await app.register(
    async (api) => {
      await api.register(publicAuthRoutes)
      await api.register(async (authed) => {
        authenticated(authed)
        await authed.register(sessionRoutes)
        await authed.register(adminRoutes)
        await authed.register(projectRoutes, { columns })
        await authed.register(linkRoutes, { registry })
        await authed.register(calendarDayRoutes)
        await authed.register(cityRoutes)
        for (const m of modules) await authed.register(m.routes, { prefix: `/${m.id}` })
      })
    },
    { prefix: '/api/v1' },
  )

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
    /** The current instant; tests pin it. */
    clock: () => Date
    /** The instance-wide ceiling on auth traffic; see guards.ts. */
    authCeiling: onRequestHookHandler
  }
}
