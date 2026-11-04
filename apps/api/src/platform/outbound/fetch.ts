import { lookup as dnsLookup } from 'node:dns'
import type { LookupFunction } from 'node:net'
import { request as httpRequest, type IncomingMessage } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { checkLinkUrl, isPublicAddress, literalAddress } from './safe-url'

/**
 * A GET to an address someone else chose: a pasted link, the icon its page names. These are the
 * API's only outbound requests, so they are shaped around what can go wrong:
 *
 * - The address is someone else's: every resolved IP must pass `isPublicAddress`, and the
 *   connection uses the address that was checked.
 * - Every redirect hop is checked again: a public page redirecting to 127.0.0.1 is the oldest
 *   detour.
 * - The far end may never answer, or send gigabytes: there is a total budget and a size cap.
 * - Failing is not an error: many sites give crawlers nothing, so failure is null.
 */

/** Which addresses may be reached; a parameter so tests can run against localhost. */
export type Allow = (ip: string, family: number) => boolean

/** What is fetched, how much of it, and what a body bigger than that means. */
export type FetchShape = {
  /** The `accept` header sent. */
  accept: string
  /** The content types taken; any other answer is null. */
  types: RegExp
  maxBytes: number
  /**
   * `cut`: the first `maxBytes` are enough (a page's <head>). `refuse`: a bigger body is not
   * wanted at all (an image cut short is no image).
   */
  larger: 'cut' | 'refuse'
}

export type Fetched = { body: Buffer; type: string; charset: string; url: URL }

const MAX_REDIRECTS = 3

export async function fetchOutside(
  raw: string,
  shape: FetchShape,
  opts: { timeoutMs: number; allow?: Allow },
): Promise<Fetched | null> {
  const allow = opts.allow ?? isPublicAddress
  // Elapsed time, not a date: the monotonic timer, which neither a pinned clock nor a clock
  // adjustment can stretch.
  const deadline = performance.now() + opts.timeoutMs

  let url = checkLinkUrl(raw)
  if (!url) return null

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const left = deadline - performance.now()
    if (left <= 0) return null
    // A numeric host skips DNS, and so the lookup guard: it is checked here.
    const literal = literalAddress(url.hostname)
    if (literal && !allow(literal.ip, literal.family)) return null
    const got = await fetchOnce(url, shape, allow, left).catch(() => null)
    if (!got) return null
    if (got.kind === 'body') return { ...got.fetched, url }
    const next = checkLinkUrl(new URL(got.location, url).href)
    if (!next) return null
    url = next
  }
  return null
}

type Hop = { kind: 'body'; fetched: Omit<Fetched, 'url'> } | { kind: 'redirect'; location: string }

/** One hop: the body, or the next address. */
function fetchOnce(
  url: URL,
  shape: FetchShape,
  allow: Allow,
  budgetMs: number,
): Promise<Hop | null> {
  return new Promise((resolve, reject) => {
    // Cutting our own connection raises ECONNRESET, which means "enough", not failure; the first
    // answer wins.
    let settled = false
    let deadline: NodeJS.Timeout | undefined
    const settle = () => {
      settled = true
      clearTimeout(deadline)
    }
    const done = (value: Hop | null) => {
      if (settled) return
      settle()
      resolve(value)
    }
    const failed = (error: Error) => {
      if (settled) return
      settle()
      reject(error)
    }

    const send = url.protocol === 'https:' ? httpsRequest : httpRequest
    const req = send(
      url,
      {
        method: 'GET',
        // Some sites refuse a request with no user agent.
        headers: {
          'user-agent': 'CTWS/1.0 (+https://github.com/lance1416/ctws)',
          accept: shape.accept,
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        lookup: guardedLookup(allow),
      },
      (res: IncomingMessage) => {
        const status = res.statusCode ?? 0
        const location = res.headers.location
        if (status >= 300 && status < 400 && location) {
          done({ kind: 'redirect', location })
          res.destroy()
          return
        }
        const type = String(res.headers['content-type'] ?? '')
        // Only what was asked for: a link to a video should not start downloading it.
        if (status !== 200 || !shape.types.test(type)) {
          done(null)
          res.destroy()
          return
        }
        const declared = Number(res.headers['content-length'])
        if (shape.larger === 'refuse' && declared > shape.maxBytes) {
          done(null)
          res.destroy()
          return
        }

        const chunks: Buffer[] = []
        let size = 0
        const body = () =>
          done({
            kind: 'body',
            fetched: { body: Buffer.concat(chunks), type, charset: charsetOf(type) },
          })
        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk)
          size += chunk.length
          // Enough, or too much: answer, then cut the connection, since the far end may never
          // finish.
          if (size >= shape.maxBytes) {
            if (shape.larger === 'cut') body()
            else if (size > shape.maxBytes) done(null)
            else return
            res.destroy()
            req.destroy()
          }
        })
        res.on('end', body)
        res.on('close', body)
        res.on('error', failed)
      },
    )
    // Absolute, not idle: a site that sends a byte now and then would never trip an idle timeout.
    deadline = setTimeout(() => {
      done(null)
      req.destroy()
    }, budgetMs)
    req.on('error', failed)
    req.end()
  })
}

/**
 * Resolves and checks in one step and hands the checked addresses to the connection, so a second
 * resolution cannot answer differently (DNS rebinding). `all` must be honoured: happy-eyeballs
 * asks with `{ all: true }` and wants an array.
 */
function guardedLookup(allow: Allow): LookupFunction {
  return (hostname, options, cb) => {
    dnsLookup(hostname, { all: true }, (err, addresses) => {
      if (err) return cb(err, [])
      const ok = addresses.filter((a) => allow(a.address, a.family))
      const first = ok[0]
      if (!first) return cb(new Error('that address is not reachable from here'), [])
      if (options?.all) return cb(null, ok)
      cb(null, first.address, first.family)
    })
  }
}

function charsetOf(contentType: string): string {
  return /charset=["']?([\w-]+)/i.exec(contentType)?.[1]?.toLowerCase() ?? 'utf-8'
}
