import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { withApp } from './helpers/app'

const HTML = { accept: 'text/html,application/xhtml+xml,*/*;q=0.8' }
const SHELL = '<!doctype html><title>spa-shell</title>'

describe('serving the built web app', () => {
  let ctx: Awaited<ReturnType<typeof withApp>>
  let dist: string

  beforeAll(async () => {
    dist = mkdtempSync(join(tmpdir(), 'ctws-web-'))
    writeFileSync(join(dist, 'index.html'), SHELL)
    mkdirSync(join(dist, 'assets'))
    writeFileSync(join(dist, 'assets', 'app.js'), 'console.log("app")')
    // A static file sitting on an API path: the API route must win over it.
    mkdirSync(join(dist, 'api', 'v1'), { recursive: true })
    writeFileSync(join(dist, 'api', 'v1', 'health'), 'STATIC FILE, NOT THE API')
    ctx = await withApp({ webDist: dist })
  }, 120_000)

  afterAll(async () => {
    await ctx?.stop()
    rmSync(dist, { recursive: true, force: true })
  })

  it('serves index.html at the root', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/', headers: HTML })
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe(SHELL)
  })

  it('serves static assets', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/assets/app.js' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('javascript')
    expect(res.body).toBe('console.log("app")')
  })

  it('falls back to index.html for a client-side route', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/some/deep/route', headers: HTML })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.body).toBe(SHELL)
  })

  it('lets API routes win over static files', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/health', headers: HTML })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/json')
    expect(res.json()).toEqual({ status: 'ok' })
  })

  it('keeps the problem+json 404 under /api/, even for a browser navigation', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/nope', headers: HTML })
    expect(res.statusCode).toBe(404)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.json()).toMatchObject({ status: 404 })
  })

  it('does not fall back for a request that does not accept HTML', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/assets/missing.js',
      headers: { accept: '*/*' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.headers['content-type']).toContain('application/problem+json')
  })

  it('does not fall back for a non-GET request', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/some/deep/route',
      headers: { ...HTML, 'x-ctws-client': 'web' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.headers['content-type']).toContain('application/problem+json')
  })

  describe('API-only mode', () => {
    it.each([
      ['WEB_DIST unset', undefined],
      ['WEB_DIST pointing at a missing directory', join(tmpdir(), 'ctws-does-not-exist')],
    ])('returns problem+json 404 for non-API paths when %s', async (_label, webDist) => {
      const app = await buildApp({ env: { ...ctx.env, webDist }, db: ctx.db })
      await app.ready()
      try {
        for (const url of ['/', '/some/deep/route']) {
          const res = await app.inject({ method: 'GET', url, headers: HTML })
          expect(res.statusCode).toBe(404)
          expect(res.headers['content-type']).toContain('application/problem+json')
        }
        const health = await app.inject({ method: 'GET', url: '/api/v1/health' })
        expect(health.statusCode).toBe(200)
      } finally {
        await app.close()
      }
    })
  })
})
