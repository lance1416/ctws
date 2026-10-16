import { API_BASE, type Endpoint, type ResponseOf } from '@ctws/contracts'
import type { FastifyInstance, FastifyReply, FastifyRequest, RouteShorthandOptions } from 'fastify'
import { z } from 'zod'

type Out<S> = S extends z.ZodType ? z.output<S> : unknown

/** A request as the endpoint's schemas parsed it. */
type RequestFor<E extends Endpoint> = FastifyRequest<{
  Params: Out<E['params']>
  Querystring: Out<E['query']>
  Body: Out<E['body']>
}>

type Handler<E extends Endpoint> = (
  req: RequestFor<E>,
  reply: FastifyReply,
) => Promise<ResponseOf<E>>

/** One endpoint and what answers it; the types meet here and are erased for registration. */
export type Served = {
  endpoint: Endpoint
  handler: Handler<Endpoint>
  options: RouteShorthandOptions
}

/**
 * Pairs an endpoint with its handler. The handler returns the success body (nothing for a 204);
 * the status is the endpoint's own unless the handler sets another it declares.
 */
export const on = <E extends Endpoint>(
  endpoint: E,
  handler: Handler<E>,
  options: RouteShorthandOptions = {},
): Served => ({ endpoint, handler: handler as unknown as Handler<Endpoint>, options })

/** The refusals an operation declares, carried to the OpenAPI pass through route config. */
declare module 'fastify' {
  interface FastifyContextConfig {
    refusals?: readonly number[]
  }
}

/**
 * Registers each endpoint at its path from the table. `app` may be mounted under a prefix inside
 * `API_BASE` (a module's id); every endpoint served there must sit under it.
 */
export function serve(app: FastifyInstance, served: readonly Served[]): void {
  const prefix = app.prefix.slice(API_BASE.length)
  for (const { endpoint: e, handler, options } of served) {
    if (!e.path.startsWith(prefix)) {
      throw new Error(`${e.method} ${e.path} is outside ${prefix || 'the API root'}`)
    }
    const response: Record<number, z.ZodType> = {}
    if (e.response) response[e.ok] = e.response
    if (e.response && e.existing) response[200] = e.response
    if (e.ok === 204) response[204] = z.null().describe('No content')
    app.route({
      ...options,
      method: e.method,
      url: e.path.slice(prefix.length),
      config: { ...options.config, refusals: e.refusals ?? [] },
      schema: {
        summary: e.summary,
        ...(e.hidden ? { hide: true } : {}),
        ...(e.params ? { params: e.params } : {}),
        ...(e.query ? { querystring: e.query } : {}),
        ...(e.body ? { body: e.body } : {}),
        response,
      },
      handler: async (req, reply) => {
        reply.code(e.ok)
        const body = await handler(req as RequestFor<Endpoint>, reply)
        if (e.ok === 204) return reply.send()
        return body
      },
    })
  }
}
