import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import fastifyStatic from '@fastify/static'
import type { FastifyInstance } from 'fastify'
import { plainProblem, sendProblem } from './problem'

/**
 * Serves the built web app, if there is one, after the API routes so they win. Browser
 * navigations outside `/api/` get the SPA shell; everything else that misses is a 404.
 */
export async function serveWeb(app: FastifyInstance, webDist: string | undefined): Promise<void> {
  const root = webDist && existsSync(webDist) ? resolve(webDist) : undefined
  if (root) {
    await app.register(fastifyStatic, {
      root,
      // Hashed `/assets/*` can never change, so a year and immutable. The rest is `no-cache`, so
      // a deploy is picked up at once.
      cacheControl: false,
      setHeaders(reply, path) {
        const hashed = /[/\\]assets[/\\]/.test(path)
        reply.header('cache-control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache')
      },
    })
  }

  app.setNotFoundHandler((req, reply) => {
    const navigation = req.method === 'GET' && (req.headers.accept ?? '').includes('text/html')
    if (root && navigation && !req.url.startsWith('/api/')) return reply.sendFile('index.html')
    return sendProblem(reply, plainProblem(404))
  })
}
