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
import { adminRoutes } from './shell/admin'
import {
  authenticated,
  SESSION_COOKIE,
  publicAuthRoutes,
  sessionRoutes,
  warmDummyHash,
} from './shell/auth'
import { calendarDayRoutes } from './shell/calendar'
import { linkRoutes, linkRegistry } from './shell/links'
import { timelineRoutes } from './shell/events'
import { mentionSource, relatedStageChanges, relationRoutes } from './shell/relations'
import { resourceRoutes } from './shell/resources'
import { migrationRoutes } from './shell/migration'
import { tombstoneRoutes } from './shell/tombstones'
import { type ProjectGraves, projectLinkable, projectRoutes } from './shell/projects'
import { cityRoutes } from './shell/cities'
import type { Db } from './platform/db/client'
import type { ApiModule } from './shell/module'
import type { Env } from './platform/config'
import { documentedQuery, documentRefusals } from './platform/http/openapi'
import { registerGuards } from './platform/http/guards'
import { handleError } from './platform/http/errors'
import { serveWeb } from './platform/http/web'

/**
 * The app's clock: the wall clock, or, when the environment pins one (`CLOCK_PINNED_AT`), a clock
 * that starts at the pinned instant and runs from there. "Today" and "in 3 days" then come out
 * the same on every run of a test or acceptance stack, while things made during a run still get
 * moments of their own, in order.
 */
function clockFrom(pinnedAt: Date | undefined): () => Date {
  if (pinnedAt === undefined) return () => new Date()
  const startedAt = Date.now()
  return () => new Date(pinnedAt.getTime() + (Date.now() - startedAt))
}

/** The app, built from the modules it is given. `clock` is replaceable for tests. */
export async function buildApp(opts: {
  env: Env
  db: Db
  modules: readonly ApiModule[]
  clock?: () => Date
}): Promise<FastifyInstance> {
  // Ready before the first sign-in, so no request pays for hashing it.
  await warmDummyHash()

  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.decorate('db', opts.db)
  app.decorate('env', opts.env)
  app.decorate('clock', opts.clock ?? clockFrom(opts.env.clockPinnedAt))

  await app.register(fastifySwagger, {
    openapi: {
      info: { title: 'CTWS API', version: '1' },
      components: {
        securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE } },
      },
    },
    transform: (input) => {
      const out = jsonSchemaTransform({
        ...input,
        schema: { ...input.schema, querystring: documentedQuery(input.schema.querystring) },
      })
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

  const { modules } = opts
  const registry = linkRegistry([...modules.map((m) => m.linkable), projectLinkable])
  const columns = Object.assign({}, ...modules.map((m) => m.projectColumns ?? {}))
  const sources = [
    ...modules.flatMap((m) => m.timelineSources?.(registry) ?? []),
    mentionSource(registry),
    relatedStageChanges(registry),
  ]
  const graves: ProjectGraves = async (tx, workspaceId, projectId) =>
    (
      await Promise.all(modules.map((m) => m.projectGraves?.(tx, workspaceId, projectId) ?? []))
    ).flat()

  await app.register(
    async (api) => {
      await api.register(publicAuthRoutes)
      await api.register(async (authed) => {
        authenticated(authed)
        await authed.register(sessionRoutes)
        await authed.register(adminRoutes)
        await authed.register(projectRoutes, { columns, graves })
        await authed.register(linkRoutes, { registry })
        await authed.register(timelineRoutes, { registry, sources })
        await authed.register(relationRoutes, { registry })
        await authed.register(resourceRoutes, { registry })
        await authed.register(tombstoneRoutes)
        await authed.register(migrationRoutes)
        await authed.register(calendarDayRoutes)
        await authed.register(cityRoutes)
        for (const m of modules) {
          await authed.register(m.routes, { prefix: `/${m.id}`, registry })
        }
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
