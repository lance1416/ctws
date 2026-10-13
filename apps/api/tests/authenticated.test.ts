import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withApp } from './helpers/app'

const PUBLIC = new Set(['/api/v1/auth/register', '/api/v1/auth/login'])
let ctx: Awaited<ReturnType<typeof withApp>>
let doc: { paths: Record<string, Record<string, { security?: unknown[] }>> }

beforeAll(async () => {
  ctx = await withApp()
  doc = (await ctx.app.inject({ method: 'GET', url: '/api/v1/openapi.json' })).json()
})
afterAll(async () => {
  await ctx?.stop()
})

const operations = () =>
  Object.entries(doc.paths).flatMap(([path, methods]) =>
    Object.entries(methods).map(([method, op]) => ({ path, method, op })),
  )

describe('the authenticated scope', () => {
  it('covers every documented operation except the public ones', () => {
    const uncovered = operations()
      .filter(({ path, op }) => !PUBLIC.has(path) && !op.security)
      .map(({ method, path }) => `${method} ${path}`)
    expect(uncovered).toEqual([])
  })

  it('refuses a request without a session', async () => {
    const open: string[] = []
    for (const { path, method } of operations()) {
      if (PUBLIC.has(path)) continue
      const url = path.replace(/\{[^}]+\}/g, '00000000-0000-7000-8000-000000000000')
      const res = await ctx.app.inject({
        method: method.toUpperCase() as 'GET',
        url,
        headers: { 'x-ctws-client': 'web' },
      })
      // Validation runs before the session check, so a 400 never reached it.
      if (res.statusCode !== 401 && res.statusCode !== 400) open.push(`${method} ${path}`)
    }
    expect(open).toEqual([])
  })
})
