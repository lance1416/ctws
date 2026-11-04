import { checkLinkUrl } from './safe-url'

/** What a page says of itself for sharing: what it is, whose it is, and its pictures. */
export type PageFacts = {
  title: string | null
  summary: string | null
  siteName: string | null
  /** Absolute, http(s): its own icon, or the site's `/favicon.ico` when it names none. */
  icon: string | null
  /** Absolute, http(s): `og:image`, when it has one. */
  image: string | null
}

const MAX_SUMMARY = 300

/** How a page is fetched: the start is enough, since what is read is in `<head>`. */
export const PAGE = {
  accept: 'text/html,application/xhtml+xml',
  types: /^\s*(text\/html|application\/xhtml\+xml)/i,
  maxBytes: 128 * 1024,
  larger: 'cut',
} as const

/**
 * og:title over <title>: the site's own line for sharing, without a "| Channel" tail. The page is
 * scanned, not matched with patterns that can backtrack, so no page can stall the process.
 * Addresses it names are made absolute against `base`, where it was found after redirects.
 */
export function readPage(body: Buffer, headerCharset: string, base: URL): PageFacts {
  const head = decode(body, headerCharset)
  const title = meta(head, 'og:title') ?? titleOf(head)
  const summary = meta(head, 'og:description')
  return {
    title,
    summary: summary === null ? null : summary.slice(0, MAX_SUMMARY),
    siteName: meta(head, 'og:site_name'),
    icon: absolute(iconOf(head), base) ?? absolute('/favicon.ico', base),
    image: absolute(meta(head, 'og:image'), base),
  }
}

/** An address the page names, absolute and http(s), or null. */
function absolute(href: string | null, base: URL): string | null {
  if (!href) return null
  const url = URL.parse(href, base)
  return url ? (checkLinkUrl(url.href)?.href ?? null) : null
}

/**
 * The icon the page names: a touch icon first, which is a PNG and large, then a plain one.
 * `rel` holds several words ("shortcut icon"), so it is read word by word.
 */
function iconOf(head: string): string | null {
  let plain: string | null = null
  for (const attrs of tags(head, 'link')) {
    const rel = (attrs.get('rel') ?? '').toLowerCase().split(/\s+/)
    const href = attrs.get('href')
    if (!href) continue
    if (rel.includes('apple-touch-icon')) return href
    if (rel.includes('icon') && plain === null) plain = href
  }
  return plain
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
  for (const attrs of tags(head, 'meta')) {
    if ([attrs.get('property'), attrs.get('name')].some((v) => v?.toLowerCase() === key)) {
      const content = attrs.get('content')
      return content === undefined ? null : clean(content) || null
    }
  }
  return null
}

/** Each `<name>` tag's attributes, in document order. */
function* tags(head: string, name: 'meta' | 'link'): Generator<Map<string, string>> {
  const opening = new RegExp(`<${name}[\\s/]`, 'gi')
  for (let found = opening.exec(head); found; found = opening.exec(head)) {
    const end = head.indexOf('>', found.index)
    if (end < 0) return
    yield attributes(head.slice(found.index + name.length + 1, end))
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
