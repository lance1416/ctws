import fastifyCookie from '@fastify/cookie'
import fastifySwagger from '@fastify/swagger'
import Fastify, { type FastifyInstance } from 'fastify'
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
import { serveWeb } from './platform/http/web'
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
  // Ready before the first sign-in, so no request pays for hashing it.
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
      const config = input.route.config
      // Carried to the operation for the refusal pass.
      return {
        ...out,
        schema: {
          ...out.schema,
          ...(config?.rateLimit ? { 'x-rate-limited': true } : {}),
          ...(config?.refusals ? { 'x-refusals': config.refusals } : {}),
        },
      }
    },
    transformObject: (spec) => documentRefusals(jsonSchemaTransformObject(spec)),
  })

  // CSRF and rate limiting; must precede the routes they guard.
  await registerGuards(app)

  // Before the auth routes, which set and clear the cookie.
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

  await serveWeb(app, opts.env.webDist)

  return app
}

declare module 'fastify' {
  interface FastifyInstance {
    db: Db
    env: Env
    /** The current instant; tests pin it. */
    clock: () => Date
  }
}
