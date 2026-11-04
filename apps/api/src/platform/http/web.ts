import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import fastifyStatic from '@fastify/static'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { plainProblem, sendProblem } from './problem'

/** Where the page's share tags put the deploy's own origin, which the build cannot know. */
const ORIGIN_MARK = '%CTWS_PUBLIC_ORIGIN%'

/**
 * The SPA shell as this deploy sends it: the origin written in where the build left its mark.
 * With no origin known, a tag that needs one is left out whole rather than sent with a relative
 * address that link previews would not read.
 */
function shellFor(html: string, publicOrigin: string | undefined): string {
  if (publicOrigin) return html.replaceAll(ORIGIN_MARK, publicOrigin)
  return html.replace(/[ \t]*<meta\b[^>]*%CTWS_PUBLIC_ORIGIN%[^>]*>[ \t]*\r?\n?/g, '')
}

/**
 * Serves the built web app, if there is one, after the API routes so they win. Browser
 * navigations outside `/api/` get the SPA shell; everything else that misses is a 404. The
 * shell is read once and sent as this deploy's, wherever it is asked for.
 */
export async function serveWeb(
  app: FastifyInstance,
  webDist: string | undefined,
  publicOrigin: string | undefined,
): Promise<void> {
  const root = webDist && existsSync(webDist) ? resolve(webDist) : undefined
  const index = root ? join(root, 'index.html') : undefined
  const shell =
    index && existsSync(index) ? shellFor(readFileSync(index, 'utf8'), publicOrigin) : undefined
  // `no-cache` makes the browser ask every time; the tag lets the answer be a bodiless 304.
  const etag =
    shell === undefined ? '' : `"${createHash('sha1').update(shell).digest('base64url')}"`
  const sendShell = (req: FastifyRequest, reply: FastifyReply) => {
    reply.header('cache-control', 'no-cache').header('etag', etag)
    if (req.headers['if-none-match'] === etag) return reply.code(304).send()
    return reply.type('text/html; charset=utf-8').send(shell)
  }

  if (root) {
    await app.register(fastifyStatic, {
      root,
      // The shell is never sent as the file on disk: it is always the one with the origin in.
      index: false,
      // Hashed `/assets/*` can never change, so a year and immutable. The rest is `no-cache`, so
      // a deploy is picked up at once.
      cacheControl: false,
      setHeaders(reply, path) {
        const hashed = /[/\\]assets[/\\]/.test(path)
        reply.header('cache-control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache')
      },
    })
    if (shell !== undefined) {
      for (const url of ['/', '/index.html']) {
        app.get(url, { schema: { hide: true } }, sendShell)
      }
    }
  }

  app.setNotFoundHandler((req, reply) => {
    const navigation = req.method === 'GET' && (req.headers.accept ?? '').includes('text/html')
    if (shell !== undefined && navigation && !req.url.startsWith('/api/'))
      return sendShell(req, reply)
    return sendProblem(reply, plainProblem(404))
  })
}
