import fastifyCookie from '@fastify/cookie'
import fastifySwagger from '@fastify/swagger'
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify'
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { authRoutes } from './auth/routes'
import { warmDummyHash } from './auth/service'
import type { Db } from './db/client'
import type { Env } from './env'
import { registerGuards } from './guards'
import { sendProblem } from './problem'

export async function buildApp(opts: { env: Env; db: Db }): Promise<FastifyInstance> {
  // Resolve the login timing-equalisation hash before the app is ready, so
  // the very first login request -- known or unknown email -- never pays
  // for hashing it. See auth/service.ts `warmDummyHash`.
  await warmDummyHash()

  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.decorate('db', opts.db)
  app.decorate('env', opts.env)

  await app.register(fastifySwagger, {
    openapi: { info: { title: 'CTWS API', version: '1' } },
    transform: jsonSchemaTransform,
  })

  // CORS, CSRF and rate limiting; must precede the routes they guard.
  await registerGuards(app)

  // Must be registered before the auth routes so `reply.setCookie` /
  // `reply.clearCookie` are available inside them.
  await app.register(fastifyCookie)

  app.setNotFoundHandler((_req, reply) => sendProblem(reply, 404, 'Not Found'))

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

  return app
}

declare module 'fastify' {
  interface FastifyInstance {
    db: Db
    env: Env
  }
}
