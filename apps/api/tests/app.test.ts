import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { buildApp } from '../src/app'
import { withApp } from './helpers/app'

let ctx: Awaited<ReturnType<typeof withApp>>

beforeAll(async () => {
  ctx = await withApp()
}, 120_000)

afterAll(async () => {
  await ctx?.stop()
})

describe('app', () => {
  it('serves a health check', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ status: 'ok' })
  })

  it('returns RFC 9457 problem details for unknown routes', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/nope' })
    expect(res.statusCode).toBe(404)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.json()).toMatchObject({ status: 404, title: expect.any(String) })
  })

  it('publishes an OpenAPI document', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/openapi.json' })
    expect(res.statusCode).toBe(200)
    const doc = res.json()
    expect(doc).toMatchObject({ openapi: expect.stringMatching(/^3\./) })

    const register = doc.paths['/api/v1/auth/register'].post
    expect(register).toBeDefined()
    expect(register.requestBody.content['application/json'].schema.required).toContain('timezone')
  })

  it('returns a problem-details 400 for a Zod validation failure', async () => {
    // Fresh instance: routes cannot be added to ctx.app after it is ready/listening, and
    // this throwaway route must never ship in production code.
    const validationApp = await buildApp({ env: ctx.env, db: ctx.db })
    validationApp.withTypeProvider().route({
      method: 'POST',
      url: '/api/v1/__test-validation',
      schema: { body: z.object({ name: z.string() }).strict() },
      handler: async () => ({ ok: true }),
    })
    await validationApp.ready()

    const res = await validationApp.inject({
      method: 'POST',
      url: '/api/v1/__test-validation',
      headers: { 'x-ctws-client': 'web' },
      payload: { name: 42 },
    })

    expect(res.statusCode).toBe(400)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.json()).toMatchObject({ status: 400, title: expect.any(String) })

    await validationApp.close()
  })
})

/**
 * THE DOCUMENT DESCRIBES THE REFUSALS TOO (D18).
 *
 * Every error is RFC 9457 problem details, and the document used to say that nowhere:
 * `components.schemas` was empty and no operation listed one error response. The statuses are
 * derived from how the app is built (`openapi.ts`), so they cannot drift route by route.
 */
describe('the OpenAPI document', () => {
  it('defines the problem shape once and points every operation at it', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/openapi.json' })
    const doc = res.json() as {
      components: { schemas: Record<string, { properties?: Record<string, unknown> }> }
      paths: Record<string, Record<string, { responses: Record<string, unknown> }>>
    }

    expect(Object.keys(doc.components.schemas)).toContain('Problem')
    expect(Object.keys(doc.components.schemas.Problem!.properties ?? {})).toEqual([
      'type',
      'title',
      'status',
      'detail',
    ])

    const ref = (path: string, method: string, status: string) =>
      JSON.stringify(doc.paths[path]?.[method]?.responses[status] ?? null)

    // Authenticated, takes a body: both a 400 and a 401, each pointing at the one schema.
    expect(ref('/api/v1/tasks/', 'post', '401')).toContain('#/components/schemas/Problem')
    expect(ref('/api/v1/tasks/', 'post', '400')).toContain('application/problem+json')
    // Rate-limited and public: a 429, and NO 401 -- nobody needs a session to be refused here.
    expect(ref('/api/v1/auth/login', 'post', '429')).toContain('#/components/schemas/Problem')
    expect(ref('/api/v1/auth/login', 'post', '401')).toBe('null')
    // Public and takes nothing: no error responses invented for it.
    expect(ref('/api/v1/health', 'get', '400')).toBe('null')
    expect(ref('/api/v1/health', 'get', '401')).toBe('null')
  })
})
