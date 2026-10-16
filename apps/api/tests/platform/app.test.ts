import { api, API_BASE, type Endpoint } from '@ctws/contracts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { buildApp } from '../../src/app'
import { withApp } from '../helpers/app'

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

  it("sends Fastify's own refusals as the plain problem for their status", async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-ctws-client': 'web', 'content-type': 'application/json' },
      payload: '{"email":',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail: expect.any(String),
    })
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

  it('refuses a write a database check rejects as 422 problem details, not a 500', async () => {
    const checkedApp = await buildApp({ env: ctx.env, db: ctx.db })
    checkedApp.post('/api/v1/__test-check', async (req) => {
      // The real error the driver raises when a row breaks a CHECK constraint (SQLSTATE 23514).
      await req.server.db.execute(
        sql`do $$ begin raise check_violation using message = 'no'; end $$`,
      )
      return { ok: true }
    })
    await checkedApp.ready()

    const res = await checkedApp.inject({
      method: 'POST',
      url: '/api/v1/__test-check',
      headers: { 'x-ctws-client': 'web' },
    })

    expect(res.statusCode).toBe(422)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.json()).toMatchObject({ status: 422, title: 'Unprocessable Entity' })

    await checkedApp.close()
  })
})

/**
 * THE DOCUMENT DESCRIBES THE REFUSALS TOO.
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
    expect(ref('/api/v1/tasks', 'post', '401')).toContain('#/components/schemas/Problem')
    expect(ref('/api/v1/tasks', 'post', '400')).toContain('application/problem+json')
    // Rate-limited and public: a 429, and the 401 a wrong password gets.
    expect(ref('/api/v1/auth/login', 'post', '429')).toContain('#/components/schemas/Problem')
    expect(ref('/api/v1/auth/login', 'post', '401')).toContain('#/components/schemas/Problem')
    // Public and takes nothing: no error responses invented for it.
    expect(ref('/api/v1/health', 'get', '400')).toBe('null')
    expect(ref('/api/v1/health', 'get', '401')).toBe('null')
    // What the handler can refuse with, declared by the endpoint.
    expect(ref('/api/v1/tasks/{id}', 'get', '404')).toContain('#/components/schemas/Problem')
    expect(ref('/api/v1/projects/{id}', 'delete', '409')).toContain('#/components/schemas/Problem')
    // A write without the client header.
    expect(ref('/api/v1/projects', 'post', '403')).toContain('#/components/schemas/Problem')
  })

  it('declares the success status each operation answers with', async () => {
    const doc = (await ctx.app.inject({ method: 'GET', url: '/api/v1/openapi.json' })).json() as {
      paths: Record<string, Record<string, { responses: Record<string, { content?: unknown }> }>>
    }
    const success = (path: string, method: string) =>
      Object.keys(doc.paths[path]?.[method]?.responses ?? {}).filter((s) => s.startsWith('2'))

    expect(success('/api/v1/tasks', 'post')).toEqual(['201'])
    expect(success('/api/v1/tasks/{id}', 'delete')).toEqual(['204'])
    expect(success('/api/v1/tasks/{id}', 'patch')).toEqual(['200'])
    // A 204 has nothing to describe.
    expect(doc.paths['/api/v1/tasks/{id}']!.delete!.responses['204']!.content).toBeUndefined()
  })

  it('documents the views of one collection as one operation that names them', async () => {
    const doc = (await ctx.app.inject({ method: 'GET', url: '/api/v1/openapi.json' })).json() as {
      paths: Record<string, Record<string, { parameters: { name: string; schema: unknown }[] }>>
    }
    const params = doc.paths['/api/v1/links']!.get!.parameters
    expect(params.find((p) => p.name === 'view')!.schema).toMatchObject({ enum: ['candidates'] })
    expect(params.map((p) => p.name)).toEqual(expect.arrayContaining(['type', 'id', 'q']))
  })

  it('documents every endpoint of the table at its own path and method', async () => {
    const doc = (await ctx.app.inject({ method: 'GET', url: '/api/v1/openapi.json' })).json() as {
      paths: Record<string, Record<string, unknown>>
    }
    const documented = Object.entries(doc.paths).flatMap(([path, methods]) =>
      Object.keys(methods).map((m) => `${m.toUpperCase()} ${path}`),
    )
    const table = Object.values(api)
      .flatMap((group) => Object.values(group) as Endpoint[])
      .filter((e) => !e.hidden)
      .map((e) => `${e.method} ${API_BASE}${e.path.replace(/:(\w+)/g, '{$1}')}`)
    expect([...new Set(table)].sort()).toEqual(
      documented.filter((d) => !d.endsWith('/health') && !d.endsWith('/openapi.json')).sort(),
    )
  })
})
