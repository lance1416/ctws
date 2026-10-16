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
 * the status is the endpoint's own unless the handler sets another it declares. A 201 says where
 * the new thing is read, by the endpoint's `location`.
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

/** The schemas of several endpoints at one method and path: any one of theirs. */
const anyOf = (schemas: z.ZodType[]): z.ZodType =>
  schemas.length === 1 ? schemas[0]! : z.union(schemas as [z.ZodType, z.ZodType])

/**
 * Registers each endpoint at its path from the table. `app` may be mounted under a prefix inside
 * `API_BASE` (a module's id); every endpoint served there must sit under it.
 *
 * Several endpoints may share a method and path when each is a view of one collection, told apart
 * by its query (`?view=`, `?q=`): they become one route that takes any of their queries and hands
 * the request to the first endpoint whose query it matches.
 */
export function serve(app: FastifyInstance, served: readonly Served[]): void {
  const prefix = app.prefix.slice(API_BASE.length)
  const routes = new Map<string, Served[]>()
  for (const one of served) {
    const { method, path } = one.endpoint
    if (!path.startsWith(prefix)) {
      throw new Error(`${method} ${path} is outside ${prefix || 'the API root'}`)
    }
    const key = `${method} ${path}`
    routes.set(key, [...(routes.get(key) ?? []), one])
  }

  for (const views of routes.values()) {
    const [first] = views as [Served, ...Served[]]
    const e = first.endpoint
    const shared = views.length > 1
    if (shared && views.some((v) => !v.endpoint.query || v.endpoint.ok !== e.ok)) {
      throw new Error(`${e.method} ${e.path}: views of one path need a query each and one status`)
    }
    const pick = (req: FastifyRequest): Served =>
      views.find((v) => !shared || v.endpoint.query!.safeParse(req.query).success) ?? first

    const answers = views.flatMap((v) => (v.endpoint.response ? [v.endpoint.response] : []))
    const response: Record<number, z.ZodType> = {}
    if (answers.length > 0) response[e.ok] = anyOf(answers)
    if (answers.length > 0 && e.existing) response[200] = anyOf(answers)
    if (e.ok === 204) response[204] = z.null().describe('No content')
    const queries = views.flatMap((v) => (v.endpoint.query ? [v.endpoint.query] : []))

    app.route({
      ...first.options,
      method: e.method,
      url: e.path.slice(prefix.length),
      config: {
        ...first.options.config,
        refusals: [...new Set(views.flatMap((v) => v.endpoint.refusals ?? []))],
      },
      schema: {
        summary: views.map((v) => v.endpoint.summary).join(' '),
        ...(e.hidden ? { hide: true } : {}),
        ...(e.params ? { params: e.params } : {}),
        ...(queries.length > 0 ? { querystring: anyOf(queries) } : {}),
        ...(e.body ? { body: e.body } : {}),
        response,
      },
      handler: async (req, reply) => {
        const { endpoint: view, handler } = pick(req)
        reply.code(view.ok)
        const body = await handler(req as RequestFor<Endpoint>, reply)
        if (view.ok === 204) return reply.send()
        if (reply.statusCode === 201 && view.location) {
          reply.header('location', `${API_BASE}${view.location(body as never)}`)
        }
        return body
      },
    })
  }
}
