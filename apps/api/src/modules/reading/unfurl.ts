import { lookup as dnsLookup } from 'node:dns'
import type { LookupFunction } from 'node:net'
import { request as httpRequest, type IncomingMessage } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { checkLinkUrl, isPublicAddress, literalAddress } from './safeUrl'

/**
 * 一条链接的标题，抓回来的那一个。
 *
 * 粘一个 url 进来的时候，这一行本来只能写 `github.com/lance1416/ctws` —— 对面自己说的那句话要
 * 好得多。Discord 那套就是这个：服务端去读目标页面的 og 标签，缓存下来。
 *
 * 这是整个 API 唯一一处主动往外发请求，所以它的形状是围着「会出什么事」长的：
 *
 * - **地址是别人给的**，所以每个解析出来的 IP 都要过 `safeUrl` 那道门，而且连的就是问过的那个
 *   地址（`lookup` 直接把它交回去），中间不再解析第二次 —— 否则 DNS rebinding 有缝可钻。
 * - **跳转每一跳都重来一遍**：一个公网地址 302 到 127.0.0.1 是最老的那条绕路。
 * - **对面可能不回话、可能回 2GB**，所以有总预算和体积上限；标题在 \`<head>\` 里，读到上限就够。
 * - **抓不到不是错**。很多站点对没登录的爬虫什么都不给（x.com 就是），所以失败一律是 null，
 *   调用者退回 host 加路径那条路。
 */

export type Unfurled = { title: string | null; summary: string | null }

/**
 * 去抓这一条链接。
 *
 * 路由拿的是这个类型而不是下面那个函数本身：测试里的服务器住在 127.0.0.1 上，而那正是线上要挡
 * 的地址，所以测试传一个放开了那道门的版本进去 —— 生产的那条路上没有任何开关。
 */
export type Unfurl = (url: string) => Promise<Unfurled | null>

/** 总预算。捕获是同步等它的，所以这个数字就是「粘一条链接最慢多久回来」。 */
const BUDGET_MS = 2000
/** 只读开头这么多：og 标签与 <title> 都在 <head> 里，正文一个字都不需要。 */
const MAX_BYTES = 128 * 1024
const MAX_REDIRECTS = 3
const MAX_SUMMARY = 300

type Options = {
  timeoutMs?: number
  /** 这个地址准不准连。默认是真的那道门；测试对着本机跑，所以它是参数。 */
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
    // 地址直接写成数字时不经过 DNS，那道 lookup 的门一次都不会被调用 —— 这里当场问。
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

/** 一跳。拿到的是开头那一段字节，或者下一个地址。 */
function fetchHead(
  url: URL,
  allow: (ip: string, family: number) => boolean,
  budgetMs: number,
): Promise<Fetched | null> {
  return new Promise((resolve, reject) => {
    // 掐断自己的连接会冒出一个 ECONNRESET：那是「够了」，不是「出错了」。两者必须分开，否则读满
    // 上限这条正常路径会被当成失败。先回答的人说了算。
    let settled = false
    const done = (value: Fetched | null) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const failed = (error: Error) => {
      if (settled) return
      settled = true
      reject(error)
    }

    const send = url.protocol === 'https:' ? httpsRequest : httpRequest
    const req = send(
      url,
      {
        method: 'GET',
        // 对面要知道是谁在敲门：没有 UA 的请求有不少站点直接拒绝。
        headers: {
          'user-agent': 'CTWS/1.0 (+https://github.com/lance1416/ctws)',
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        // 解析与校验在同一步，连的就是问过的那个地址。
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
        // 只认网页：一条指向 2GB 视频的链接，连下载都不该开始。
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
          // 够了就先交卷再掐连接：标题在 <head> 里，正文一个字都不需要，而对面可能永远写不完。
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
    req.setTimeout(budgetMs, () => req.destroy(new Error('took too long')))
    req.on('error', failed)
    req.end()
  })
}

/**
 * 解析地址并当场判断。
 *
 * 问过的地址直接交回给连接，不让它自己再解析一次：先问 DNS、再连一次 DNS，中间那一瞬可以换一个
 * 答案（DNS rebinding），而那正是这道门要挡的事。
 *
 * `all` 必须照着答。Node 的 happy-eyeballs 会带着 `{ all: true }` 来问、要的是一个数组，回单个
 * 地址的话每一个域名都会死在「Invalid IP address: undefined」上 —— 而数字地址根本不走 DNS，所以
 * 这件事不会在用数字地址的用例里露出来。过关的地址全给回去，happy-eyeballs 照常挑，挑到的每一个
 * 都是问过的。
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

/** og:title 胜过 <title>：站点自己为分享写的那一句，没有「| 频道名」那种尾巴。 */
function readFacts(body: Buffer, headerCharset: string): Unfurled | null {
  const head = decode(body, headerCharset)
  const title = meta(head, 'og:title') ?? tag(head) ?? null
  const summary = meta(head, 'og:description')
  if (!title && !summary) return null
  return { title, summary: summary === null ? null : summary.slice(0, MAX_SUMMARY) }
}

/**
 * 字节变字符串。
 *
 * 编码先信响应头，没有就信页面自己的 <meta charset>（中文站点里 GBK 还活着，按 UTF-8 读会得到
 * 一行乱码当标题）。为了读那个 meta，先按 latin1 看一眼 —— ASCII 那一段在任何编码里都一样。
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

function tag(head: string): string | null {
  const raw = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1]
  return raw === undefined ? null : clean(raw)
}

/** `property` 与 `name` 都认，属性顺序也都认：这两种写法真实世界里一样多。 */
function meta(head: string, key: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]*>|<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["'][^>]*>`,
    'i',
  )
  const found = pattern.exec(head)
  if (!found) return null
  const content = found[1] ?? /content=["']([^"']*)["']/i.exec(found[0])?.[1]
  return content === undefined ? null : clean(content) || null
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/** 实体还原、空白收拢。标题里的换行与缩进是源码的排版，不是那句话的一部分。 */
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
