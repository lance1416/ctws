/**
 * 出站抓取那道门：哪些地址可以去连。
 *
 * 这是 API 第一次主动往外发请求，而目标地址是别人粘进来的任意字符串。没有这道门，一条
 * `http://169.254.169.254/` 的链接就是让服务器替人去读云元数据，一条 `http://10.0.0.5:6379/`
 * 就是让它替人探内网 —— 粘链接的人甚至不必知道自己在做这件事，页面上的一次跳转就够了。
 *
 * 判断写成纯函数，是因为它是这块里唯一一处写错就出事的地方。真正去连的那一步（`unfurl.ts`）
 * 把 DNS 解析出来的每个地址都拿到这里问一遍，并且连的就是问过的那个地址 —— 问完再解析一次会
 * 给 DNS rebinding 留一条缝。
 */

/** 一个 IPv4 文本地址的四个字节；不是四段十进制就返回 null。 */
function v4Bytes(ip: string): [number, number, number, number] | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const bytes = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : -1))
  if (bytes.some((b) => b < 0 || b > 255)) return null
  return bytes as [number, number, number, number]
}

/** IANA 的特殊用途地址，外加 CGNAT 与组播、保留段。 */
function publicV4(ip: string): boolean {
  const b = v4Bytes(ip)
  if (!b) return false
  const [a, c] = b
  if (a === 0 || a === 10 || a === 127) return false
  if (a === 169 && c === 254) return false // 链路本地，云元数据就在这里
  if (a === 172 && c >= 16 && c <= 31) return false
  if (a === 192 && c === 168) return false
  if (a === 100 && c >= 64 && c <= 127) return false // CGNAT
  if (a === 198 && (c === 18 || c === 19)) return false // 基准测试网段
  if (a === 192 && c === 0 && (b[2] === 0 || b[2] === 2)) return false
  if (a === 192 && c === 88 && b[2] === 99) return false // 6to4 中继
  if (a === 198 && c === 51 && b[2] === 100) return false // TEST-NET-2
  if (a === 203 && c === 0 && b[2] === 113) return false // TEST-NET-3
  if (a >= 224) return false // 组播与保留，含 255.255.255.255
  return true
}

/** 把 IPv6 文本地址展开成 16 个字节；`::` 与末尾的点分 v4 都认。 */
function v6Bytes(ip: string): number[] | null {
  const zone = ip.indexOf('%')
  const text = zone < 0 ? ip : ip.slice(0, zone)
  const halves = text.split('::')
  if (halves.length > 2) return null

  const expand = (part: string): number[] | null => {
    if (part === '') return []
    const out: number[] = []
    const groups = part.split(':')
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]!
      if (g.includes('.')) {
        // 结尾那一段可以写成点分十进制（`::ffff:127.0.0.1`）。
        if (i !== groups.length - 1) return null
        const v4 = v4Bytes(g)
        if (!v4) return null
        out.push(...v4)
        continue
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null
      const n = Number.parseInt(g, 16)
      out.push(n >> 8, n & 0xff)
    }
    return out
  }

  const head = expand(halves[0] ?? '')
  const tail = halves.length === 2 ? expand(halves[1] ?? '') : []
  if (!head || !tail) return null
  if (halves.length === 1) return head.length === 16 ? head : null
  const gap = 16 - head.length - tail.length
  if (gap < 0) return null
  return [...head, ...new Array<number>(gap).fill(0), ...tail]
}

function publicV6(ip: string): boolean {
  const b = v6Bytes(ip)
  if (!b) return false
  if (b.every((x) => x === 0)) return false // ::
  if (b.slice(0, 15).every((x) => x === 0) && b[15] === 1) return false // ::1
  if ((b[0]! & 0xfe) === 0xfc) return false // fc00::/7，唯一本地地址
  if (b[0] === 0xfe && (b[1]! & 0xc0) === 0x80) return false // fe80::/10，链路本地
  if (b[0] === 0xff) return false // ff00::/8，组播
  if (b[0] === 0x01 && b.slice(1, 8).every((x) => x === 0)) return false // 100::/64，丢弃前缀

  // 把 v4 包在里面的三种写法：裹着的地址本身也要问一遍，否则 ::ffff:10.0.0.1 就是一条绕路。
  const asV4 = (bytes: number[]) => bytes.join('.')
  const mapped = b.slice(0, 10).every((x) => x === 0) && b[10] === 0xff && b[11] === 0xff
  if (mapped) return publicV4(asV4(b.slice(12)))
  const nat64 = b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b
  if (nat64) return publicV4(asV4(b.slice(12)))
  if (b[0] === 0x20 && b[1] === 0x02) return publicV4(asV4(b.slice(2, 6))) // 2002::/16，6to4
  return true
}

/** 这个地址在外面吗？解析出来的每一个候选地址都要过这一关。 */
export function isPublicAddress(ip: string, family: number): boolean {
  return family === 6 ? publicV6(ip) : publicV4(ip)
}

/**
 * 这个链接可以去抓吗？可以就把 URL 给出来，不可以就是 null。
 *
 * 只管协议与用户名密码：端口不管（真有网页住在 :8443 上），内网地址交给 `isPublicAddress` ——
 * 挡住哪些地址才是这道门的内容，而端口挡不住任何一件已经被地址挡住的事。
 */
export function checkLinkUrl(raw: string): URL | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  // 用户名密码只会被原样发给对面，而粘进来的链接里带着它们多半是意外。
  if (u.username !== '' || u.password !== '') return null
  return u
}

/**
 * 主机名本身就是一个 IP 吗？是的话给出它，好当场问那道门。
 *
 * 这一条不是多余的小心：主机名是数字地址时，Node 根本不会去解析 DNS，于是 `lookup` 那道门
 * 一次都不会被调用 —— 一条 `http://169.254.169.254/` 会直接连上去。
 */
export function literalAddress(hostname: string): { ip: string; family: number } | null {
  // URL 里的 IPv6 带着方括号。
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return { ip: hostname.slice(1, -1), family: 6 }
  }
  return /^[0-9.]+$/.test(hostname) ? { ip: hostname, family: 4 } : null
}
