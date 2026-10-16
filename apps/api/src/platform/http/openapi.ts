import { problem } from '@ctws/contracts'
import { STATUS_CODES } from 'node:http'
import { z } from 'zod'

type Operation = {
  parameters?: unknown[]
  requestBody?: unknown
  responses?: Record<string, { description?: string; content?: unknown }>
  security?: unknown[]
  'x-rate-limited'?: boolean
  'x-refusals'?: readonly number[]
}
type Spec = {
  components?: { schemas?: Record<string, unknown> }
  paths?: Record<string, Record<string, Operation>>
}

const PROBLEM_REF = { $ref: '#/components/schemas/Problem' }
const refusal = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: PROBLEM_REF } },
})

/** What each declared refusal means here; a status not listed is described by its phrase. */
const MEANING: Record<number, string> = {
  401: 'The credentials were not accepted.',
  403: 'Not allowed for this account.',
  404: 'Something the request names does not exist, or is not visible to this account.',
  409: 'The current state does not allow it.',
  422: 'Well formed, but it cannot hold.',
}

const UNSAFE = new Set(['post', 'put', 'patch', 'delete'])

/**
 * The query parameters of views that share a path, for the document: every view's parameters,
 * each optional, and a literal they are told apart by (`view`) as the enum of its values. The
 * route itself validates the views as they are.
 */
export function documentedQuery(schema: unknown): unknown {
  if (!(schema instanceof z.ZodUnion)) return schema
  const shape: Record<string, z.ZodType> = {}
  const literals: Record<string, string[]> = {}
  for (const option of schema.options) {
    if (!(option instanceof z.ZodObject)) return schema
    for (const [key, field] of Object.entries(option.shape as Record<string, z.ZodType>)) {
      if (field instanceof z.ZodLiteral) {
        literals[key] = [...(literals[key] ?? []), ...[...field.values].map(String)]
      } else shape[key] ??= field.optional()
    }
  }
  for (const [key, values] of Object.entries(literals)) {
    shape[key] = z.enum(values as [string, ...string[]]).optional()
  }
  return z.object(shape)
}

/**
 * Adds the refusals an operation can meet. Some follow from how the route is registered: 400 when
 * it takes input, 401 when it sits in the authenticated scope (it declares `security`), 403 when
 * its method needs the client header, 429 when it is rate limited. The rest are the endpoint's
 * own declaration (`x-refusals`). A 204 carries no content.
 */
export function documentRefusals<T extends object>(spec: T): T {
  const doc = spec as T & Spec
  doc.components ??= {}
  doc.components.schemas ??= {}
  doc.components.schemas.Problem = z.toJSONSchema(problem, { target: 'openapi-3.0' })

  for (const methods of Object.values(doc.paths ?? {})) {
    for (const [method, operation] of Object.entries(methods)) {
      const responses = (operation.responses ??= {})
      if (responses['204']) responses['204'] = { description: 'No content' }
      const takesInput =
        (Array.isArray(operation.parameters) && operation.parameters.length > 0) ||
        operation.requestBody !== undefined
      if (takesInput) responses['400'] ??= refusal('The request did not match the schema.')
      if (operation.security) responses['401'] ??= refusal('No valid session.')
      for (const status of operation['x-refusals'] ?? []) {
        responses[String(status)] ??= refusal(MEANING[status] ?? STATUS_CODES[status] ?? '')
      }
      delete operation['x-refusals']
      if (UNSAFE.has(method)) {
        responses['403'] ??= refusal('Sent without the x-ctws-client header.')
      }
      if (operation['x-rate-limited']) {
        responses['429'] ??= refusal('Too many attempts; try again later.')
        delete operation['x-rate-limited']
      }
    }
  }
  return doc
}
