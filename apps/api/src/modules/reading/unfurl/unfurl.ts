import { lookup as dnsLookup } from 'node:dns'
import type { LookupFunction } from 'node:net'
import { request as httpRequest, type IncomingMessage } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { checkLinkUrl, isPublicAddress, literalAddress } from './safe-url'

/**
 * A link's title and summary as its own page states them. This is the API's only outbound
 * request, so it is shaped around what can go wrong:
 *
 * - The address is someone else's: every resolved IP must pass `isPublicAddress`, and the
 *   connection uses the address that was checked.
 * - Every redirect hop is checked again: a public page redirecting to 127.0.0.1 is the oldest
 *   detour.
 * - The far end may never answer, or send gigabytes: there is a total budget and a size cap, and
 *   the title is in `<head>`.
 * - Failing is not an error: many sites give crawlers nothing, so failure is null and the caller
 *   shows the host and path.
 */

type Unfurled = { title: string | null; summary: string | null }

/**
 * What routes take instead of the function itself: tests pass a version that may reach
 * 127.0.0.1, which production must refuse.
 */
export type Unfurl = (url: string) => Promise<Unfurled | null>

/** The total budget; capture waits for it, so it is the slowest a pasted link comes back. */
const BUDGET_MS = 2000
/** Only the start is read: the og tags and <title> are in <head>. */
const MAX_BYTES = 128 * 1024
const MAX_REDIRECTS = 3
const MAX_SUMMARY = 300

type Options = {
  timeoutMs?: number
  /** Which addresses may be reached; a parameter so tests can run against localhost. */
  allow?: (ip: string, family: number) => boolean
}

export async function unfurl(raw: string, opts: Options = {}): Promise<Unfurled | null> {
  const allow = opts.allow ?? isPublicAddress
  const deadline = Date.now() + (opts.timeoutMs ?? BUDGET_MS)

  let url = checkLinkUrl(raw)
  if (!url) return null

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const left = deadline - Date.now()
    if (left <= 0) return null
    // A numeric host skips DNS, and so the lookup guard: it is checked here.
    const literal = literalAddress(url.hostname)
    if (literal && !allow(literal.ip, literal.family)) return null
    const got = await fetchHead(url, allow, left).catch(() => null)
    if (!got) return null
    if (got.kind === 'page') return readFacts(got.body, got.charset)
    const next = checkLinkUrl(new URL(got.location, url).href)
    if (!next) return null
    url = next
  }
  return null
}

type Fetched =
  { kind: 'page'; body: Buffer; charset: string } | { kind: 'redirect'; location: string }

/** One hop: the first bytes of a page, or the next address. */
function fetchHead(
  url: URL,
  allow: (ip: string, family: number) => boolean,
  budgetMs: number,
): Promise<Fetched | null> {
  return new Promise((resolve, reject) => {
    // Cutting our own connection raises ECONNRESET, which means "enough", not failure; the first
    // answer wins.
    let settled = false
    let deadline: NodeJS.Timeout | undefined
    const settle = () => {
      settled = true
      clearTimeout(deadline)
    }
    const done = (value: Fetched | null) => {
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
          accept: 'text/html,application/xhtml+xml',
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
        // Pages only: a link to a video should not start downloading it.
        if (status !== 200 || !/^\s*(text\/html|application\/xhtml\+xml)/i.test(type)) {
          done(null)
          res.destroy()
          return
        }

        const chunks: Buffer[] = []
        let size = 0
        const page = () =>
          done({ kind: 'page', body: Buffer.concat(chunks), charset: charsetOf(type) })
        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk)
          size += chunk.length
          // Enough: answer, then cut the connection, since the far end may never finish.
          if (size >= MAX_BYTES) {
            page()
            res.destroy()
            req.destroy()
          }
        })
        res.on('end', page)
        res.on('close', page)
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
function guardedLookup(allow: (ip: string, family: number) => boolean): LookupFunction {
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

/**
 * og:title over <title>: the site's own line for sharing, without a "| Channel" tail. The page is
 * scanned, not matched with patterns that can backtrack, so no page can stall the process.
 */
function readFacts(body: Buffer, headerCharset: string): Unfurled | null {
  const head = decode(body, headerCharset)
  const title = meta(head, 'og:title') ?? titleOf(head)
  const summary = meta(head, 'og:description')
  if (!title && !summary) return null
  return { title, summary: summary === null ? null : summary.slice(0, MAX_SUMMARY) }
}

/**
 * Decodes with the header's charset, else the page's own <meta charset> (GBK is still common),
 * read through latin1 because its ASCII prefix is the same in every encoding.
 */
function decode(body: Buffer, headerCharset: string): string {
  const declared =
    headerCharset !== 'utf-8'
      ? headerCharset
      : (/<meta[^>]+charset=["']?([\w-]+)/i.exec(body.subarray(0, 2048).toString('latin1'))?.[1] ??
        'utf-8')
  try {
    return new TextDecoder(declared).decode(body)
  } catch {
    return body.toString('utf8')
  }
}

function titleOf(head: string): string | null {
  const open = /<title\b/i.exec(head)
  if (!open) return null
  const start = head.indexOf('>', open.index)
  if (start < 0) return null
  const close = /<\/title/gi
  close.lastIndex = start + 1
  const end = close.exec(head)
  return end ? clean(head.slice(start + 1, end.index)) : null
}

/** The `content` of the first <meta> whose `property` or `name` is `key`. */
function meta(head: string, key: string): string | null {
  for (const attrs of metaTags(head)) {
    if ([attrs.get('property'), attrs.get('name')].some((v) => v?.toLowerCase() === key)) {
      const content = attrs.get('content')
      return content === undefined ? null : clean(content) || null
    }
  }
  return null
}

/** Each <meta> tag's attributes, in document order. */
function* metaTags(head: string): Generator<Map<string, string>> {
  const opening = /<meta[\s/]/gi
  for (let found = opening.exec(head); found; found = opening.exec(head)) {
    const end = head.indexOf('>', found.index)
    if (end < 0) return
    yield attributes(head.slice(found.index + '<meta'.length, end))
    opening.lastIndex = end
  }
}

const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f'

/** A tag's attributes by lower-cased name, read in one pass. */
function attributes(tag: string): Map<string, string> {
  const attrs = new Map<string, string>()
  let i = 0
  const skipSpace = () => {
    while (i < tag.length && (isSpace(tag[i]!) || tag[i] === '/')) i++
  }
  while (i < tag.length) {
    skipSpace()
    const nameStart = i
    while (i < tag.length && !isSpace(tag[i]!) && tag[i] !== '=' && tag[i] !== '/') i++
    const name = tag.slice(nameStart, i).toLowerCase()
    skipSpace()
    if (tag[i] !== '=') {
      if (name) attrs.set(name, '')
      continue
    }
    i++
    skipSpace()
    const quote = tag[i]
    let value: string
    if (quote === '"' || quote === "'") {
      const close = tag.indexOf(quote, i + 1)
      value = tag.slice(i + 1, close < 0 ? tag.length : close)
      i = close < 0 ? tag.length : close + 1
    } else {
      const valueStart = i
      while (i < tag.length && !isSpace(tag[i]!)) i++
      value = tag.slice(valueStart, i)
    }
    if (name && !attrs.has(name)) attrs.set(name, value)
  }
  return attrs
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/** Decodes entities and collapses the source's line breaks and indentation. */
function clean(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole)
    .replace(/\s+/g, ' ')
    .trim()
}
