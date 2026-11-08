import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app'
import { withApp } from '../helpers/app'

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
    // Stands in for the real content-hashed CJK webfont, which is the whole reason the caching
    // below matters: 1.8 MiB re-downloaded on every navigation, or downloaded once.
    writeFileSync(join(dist, 'assets', 'noto-sans-sc-subset-C6NWTKHK.woff2'), 'wOF2-not-really')
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
    expect(res.json()).toMatchObject({ status: 'ok' })
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

  // Without a built web app (in development, Vite serves it and proxies the API) nothing web is
  // served.
  describe('API-only mode', () => {
    it.each([
      ['WEB_DIST unset', undefined],
      ['WEB_DIST pointing at a missing directory', join(tmpdir(), 'ctws-does-not-exist')],
    ])('returns problem+json 404 for non-API paths when %s', async (_label, webDist) => {
      const app = await buildApp({ env: { ...ctx.env, webDist }, db: ctx.db, modules: ctx.modules })
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

  /**
   * The two halves of the caching rule, which exist for different reasons and must not be
   * conflated. Everything under /assets carries a content hash in its filename, so the bytes at a
   * URL can never change and the browser need never ask again. index.html has no hash, so caching
   * it the same way would mean a deploy is never picked up.
   */
  describe('cache-control', () => {
    it('serves a content-hashed asset immutable for a year', async () => {
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/assets/noto-sans-sc-subset-C6NWTKHK.woff2',
      })
      expect(res.statusCode).toBe(200)
      expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    })

    it.each([
      ['the root', '/'],
      ['the SPA fallback for a client-side route', '/some/deep/route'],
    ])('does not let the browser hold index.html, via %s', async (_label, url) => {
      const res = await ctx.app.inject({ method: 'GET', url, headers: HTML })
      expect(res.statusCode).toBe(200)
      expect(res.headers['cache-control']).toBe('no-cache')
      expect(res.headers['cache-control']).not.toContain('immutable')
      expect(res.headers['cache-control']).not.toMatch(/max-age=[1-9]/)
    })

    it('still answers index.html with a cheap 304 when it has not changed', async () => {
      const first = await ctx.app.inject({ method: 'GET', url: '/', headers: HTML })
      const etag = first.headers.etag as string
      expect(etag).toBeTruthy()
      const again = await ctx.app.inject({
        method: 'GET',
        url: '/',
        headers: { ...HTML, 'if-none-match': etag },
      })
      expect(again.statusCode).toBe(304)
      expect(again.body).toBe('')
    })
  })
})

/**
 * The share tags name the deploy in full, which link previews need and the build cannot know:
 * `PUBLIC_ORIGIN` is written in where the build left its mark, and never a request's Host.
 */
describe('the deploy origin in the shell', () => {
  const PAGE = [
    '<!doctype html>',
    '<head>',
    '  <meta property="og:title" content="CTWS">',
    '  <meta property="og:image" content="%CTWS_PUBLIC_ORIGIN%/og.png">',
    '  <meta property="og:url" content="%CTWS_PUBLIC_ORIGIN%/" />',
    '  <meta property="og:image:width" content="1200" data-with="%CTWS_PUBLIC_ORIGIN%" />',
    '  <meta name="twitter:card" content="summary_large_image" data-with="%CTWS_PUBLIC_ORIGIN%" />',
    '</head>',
  ].join('\n')
  let dist: string
  const apps: Awaited<ReturnType<typeof withApp>>[] = []

  beforeAll(() => {
    dist = mkdtempSync(join(tmpdir(), 'ctws-web-'))
    writeFileSync(join(dist, 'index.html'), PAGE)
  })

  afterAll(async () => {
    for (const a of apps) await a.stop()
    rmSync(dist, { recursive: true, force: true })
  })

  const shellOf = async (publicOrigin: string | undefined, url: string, host = 'ctws.test') => {
    const ctx = await withApp({ webDist: dist, publicOrigin })
    apps.push(ctx)
    const res = await ctx.app.inject({ method: 'GET', url, headers: { ...HTML, host } })
    expect(res.statusCode).toBe(200)
    return res.body
  }

  it.each(['/', '/index.html', '/people/someone'])('is written in at %s', async (url) => {
    const body = await shellOf('https://ctws.example.com', url, 'evil.example')
    expect(body).toContain('content="https://ctws.example.com/og.png"')
    expect(body).toContain('content="https://ctws.example.com/"')
    expect(body).not.toContain('%CTWS_PUBLIC_ORIGIN%')
    expect(body).not.toContain('evil.example')
    // The tags that go with the address stay, without the attribute that tied them to it.
    expect(body).toContain('<meta property="og:image:width" content="1200" />')
    expect(body).toContain('<meta name="twitter:card" content="summary_large_image" />')
    expect(body).not.toContain('data-with')
  })

  it('leaves out, whole, every tag that needs it when none is set, and keeps the rest', async () => {
    const body = await shellOf(undefined, '/')
    expect(body).not.toContain('og:image')
    expect(body).not.toContain('og:url')
    expect(body).not.toContain('%CTWS_PUBLIC_ORIGIN%')
    expect(body).toContain('<meta property="og:title" content="CTWS">')
    expect(body).toBe(
      PAGE.split('\n')
        .filter((l) => !l.includes('%CTWS'))
        .join('\n'),
    )
  })
})
