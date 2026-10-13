/**
 * Adds the refusals every operation can meet, derived from how the route is registered: 400 when
 * it takes input, 401 when it sits in the authenticated scope (it declares `security`), 429 when
 * it is rate limited. 404 and 409 depend on the handler and are not derived.
 */
type Operation = {
  parameters?: unknown[]
  requestBody?: unknown
  responses?: Record<string, unknown>
  security?: unknown[]
  'x-rate-limited'?: boolean
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

export function documentRefusals<T extends object>(spec: T): T {
  const doc = spec as T & Spec
  doc.components ??= {}
  doc.components.schemas ??= {}
  doc.components.schemas.Problem = {
    type: 'object',
    description:
      'RFC 9457 problem details. Every refusal this API makes has this shape and is sent as application/problem+json.',
    required: ['type', 'title', 'status'],
    additionalProperties: false,
    properties: {
      type: { type: 'string', example: 'about:blank' },
      title: { type: 'string', example: 'Not Found' },
      status: { type: 'integer', example: 404 },
      detail: { type: 'string' },
    },
  }

  for (const methods of Object.values(doc.paths ?? {})) {
    for (const operation of Object.values(methods)) {
      const responses = (operation.responses ??= {})
      const takesInput =
        (Array.isArray(operation.parameters) && operation.parameters.length > 0) ||
        operation.requestBody !== undefined
      if (takesInput) responses['400'] ??= refusal('The request did not match the schema.')
      if (operation.security) responses['401'] ??= refusal('No valid session.')
      if (operation['x-rate-limited']) {
        responses['429'] ??= refusal('Too many attempts; try again later.')
        delete operation['x-rate-limited']
      }
    }
  }
  return doc
}
