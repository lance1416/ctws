import fastifySwagger from '@fastify/swagger'
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify'
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import type { Db } from './db/client'
import type { Env } from './env'
import { sendProblem } from './problem'

export async function buildApp(opts: { env: Env; db: Db }): Promise<FastifyInstance> {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.decorate('db', opts.db)
  app.decorate('env', opts.env)

  await app.register(fastifySwagger, {
    openapi: { info: { title: 'CTWS API', version: '1' } },
    transform: jsonSchemaTransform,
  })

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

  return app
}

declare module 'fastify' {
  interface FastifyInstance {
    db: Db
    env: Env
  }
}
