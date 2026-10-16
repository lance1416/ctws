import type { z } from 'zod'

/** Where the API is mounted; every path in the endpoint table is relative to it. */
export const API_BASE = '/api/v1'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * The refusals an operation documents beyond the ones its registration implies (400 for input,
 * 401 inside the session scope, 403 for an unsafe method without the client header, 429 when it
 * is rate limited).
 */
type Refusal = 401 | 403 | 404 | 409 | 422

/**
 * One operation: how it is called, what it takes, and what it answers. The API registers its
 * route from this, the OpenAPI document is generated from that, and the web client calls it.
 */
export type Endpoint = {
  method: Method
  /** Fastify's form: `/tasks/:id`. */
  path: `/${string}`
  summary: string
  params?: z.ZodType
  query?: z.ZodType
  body?: z.ZodType
  /** The success status. A 204 carries no body; every other one carries `response`. */
  ok: 200 | 201 | 204
  response?: z.ZodType
  /** A create that may find the thing already there: it then answers 200, with the same body. */
  existing?: true
  /** Where a 201's new thing can be read, from what the 201 carries. */
  location?: (created: never) => string
  refusals?: readonly Refusal[]
  /** Left out of the published document. */
  hidden?: true
}

/** An endpoint, its literal types kept so callers are typed from it. */
export const endpoint = <const E extends Endpoint>(e: E): E => e

type In<S> = S extends z.ZodType ? z.input<S> : never

/** A part of a request: required unless every field in it is optional. */
type Part<Key extends string, S> = [S] extends [z.ZodType]
  ? Record<never, never> extends In<S>
    ? { [K in Key]?: In<S> }
    : { [K in Key]: In<S> }
  : { [K in Key]?: never }

/** What a caller sends: path params, query and body, each as its schema takes it. */
export type RequestOf<E extends Endpoint> = Part<'params', E['params']> &
  Part<'query', E['query']> &
  Part<'body', E['body']>

/** What a call answers with: the parsed body, or nothing for a 204. */
export type ResponseOf<E extends Endpoint> = E['response'] extends z.ZodType
  ? z.output<E['response']>
  : void

type Scalar = string | number | boolean | null | undefined

/**
 * The path of a call: `:name` segments filled from `params`, then the query's defined values.
 * Relative to `API_BASE`.
 */
export function href(e: Pick<Endpoint, 'path'>, params: object = {}, query: object = {}): string {
  const values = params as Record<string, Scalar>
  const path = e.path.replace(/:([A-Za-z]+)/g, (_, name: string) =>
    encodeURIComponent(String(values[name])),
  )
  // No `URLSearchParams`: this package runs without DOM or Node types.
  const qs = Object.entries(query as Record<string, Scalar>)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
  return qs ? `${path}?${qs}` : path
}
