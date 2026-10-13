/**
 * WHAT THE DOCUMENT SAYS ABOUT REFUSALS.
 *
 * Every error this API returns is one shape -- RFC 9457 problem details, `application/problem+json`
 * -- and before this the document said so nowhere: `components.schemas` was empty and not one
 * operation listed a single error response. A reader could see what a successful call returns and
 * had to guess at everything else.
 *
 * DERIVED, NOT REPEATED. The statuses below follow from how the app is built rather than from a
 * decision per route, so they are added in one pass over the finished document:
 *
 *   - 400 wherever an operation takes input at all, because the validator rejects a body or a
 *     query string that does not match its schema.
 *   - 401 on everything except the handful of public paths, because `requireUser` is the
 *     preHandler on all of them.
 *   - 429 on the two auth routes that carry a rate limit.
 *
 * What is NOT derived is 404/409: they depend on what a handler can discover (a task in another
 * workspace, a cycle), which the document has no way to know. A route that answers one declares
 * it in its own schema.
 */
type Operation = {
  parameters?: unknown[]
  requestBody?: unknown
  responses?: Record<string, unknown>
}
type Spec = {
  components?: { schemas?: Record<string, unknown> }
  paths?: Record<string, Record<string, Operation>>
}

/** The paths anybody may reach without a session. Everything else is behind `requireUser`. */
const PUBLIC = new Set([
  '/api/v1/health',
  '/api/v1/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/logout',
])

/** The ones that carry `config.rateLimit`, i.e. where a 429 is a real answer. */
const LIMITED = new Set(['/api/v1/auth/register', '/api/v1/auth/login'])

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

  for (const [path, methods] of Object.entries(doc.paths ?? {})) {
    for (const operation of Object.values(methods)) {
      const responses = (operation.responses ??= {})
      const takesInput =
        (Array.isArray(operation.parameters) && operation.parameters.length > 0) ||
        operation.requestBody !== undefined
      if (takesInput) responses['400'] ??= refusal('The request did not match the schema.')
      if (!PUBLIC.has(path)) responses['401'] ??= refusal('No valid session.')
      if (LIMITED.has(path)) responses['429'] ??= refusal('Too many attempts; try again later.')
    }
  }
  return doc
}
