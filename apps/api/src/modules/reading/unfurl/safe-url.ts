/**
 * Which addresses an outbound fetch may reach. Without this, a pasted `http://169.254.169.254/`
 * reads cloud metadata and `http://10.0.0.5:6379/` probes the internal network, one redirect
 * away from any page. `unfurl.ts` asks about every resolved address and connects to that same
 * address, so a second resolution cannot slip past (DNS rebinding).
 */

/** The four bytes of an IPv4 address, or null if it is not four decimal parts. */
function v4Bytes(ip: string): [number, number, number, number] | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const bytes = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : -1))
  if (bytes.some((b) => b < 0 || b > 255)) return null
  return bytes as [number, number, number, number]
}

/** IANA's special-purpose ranges, plus CGNAT, multicast and reserved. */
function publicV4(ip: string): boolean {
  const b = v4Bytes(ip)
  if (!b) return false
  const [a, c] = b
  if (a === 0 || a === 10 || a === 127) return false
  if (a === 169 && c === 254) return false // link-local, where cloud metadata lives
  if (a === 172 && c >= 16 && c <= 31) return false
  if (a === 192 && c === 168) return false
  if (a === 100 && c >= 64 && c <= 127) return false // CGNAT
  if (a === 198 && (c === 18 || c === 19)) return false // benchmarking
  if (a === 192 && c === 0 && (b[2] === 0 || b[2] === 2)) return false
  if (a === 192 && c === 88 && b[2] === 99) return false // 6to4 relay
  if (a === 198 && c === 51 && b[2] === 100) return false // TEST-NET-2
  if (a === 203 && c === 0 && b[2] === 113) return false // TEST-NET-3
  if (a >= 224) return false // multicast and reserved, broadcast included
  return true
}

/** The 16 bytes of an IPv6 address; `::` and a trailing dotted IPv4 are accepted. */
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
        // Only the last group may be dotted IPv4 (`::ffff:127.0.0.1`).
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
  if ((b[0]! & 0xfe) === 0xfc) return false // fc00::/7, unique local
  if (b[0] === 0xfe && (b[1]! & 0xc0) === 0x80) return false // fe80::/10, link-local
  if (b[0] === 0xff) return false // ff00::/8, multicast
  if (b[0] === 0x01 && b.slice(1, 8).every((x) => x === 0)) return false // 100::/64, discard

  // IPv4 embedded five ways: the inner address is checked too, or ::ffff:10.0.0.1 gets through.
  const asV4 = (bytes: number[]) => bytes.join('.')
  const zeros = (from: number, to: number) => b.slice(from, to).every((x) => x === 0)
  const mapped = zeros(0, 10) && b[10] === 0xff && b[11] === 0xff
  if (mapped) return publicV4(asV4(b.slice(12)))
  if (zeros(0, 12)) return publicV4(asV4(b.slice(12))) // ::/96, IPv4-compatible
  const translated = zeros(0, 8) && b[8] === 0xff && b[9] === 0xff && zeros(10, 12)
  if (translated) return publicV4(asV4(b.slice(12))) // ::ffff:0:0/96
  const nat64 = b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b
  if (nat64) return publicV4(asV4(b.slice(12)))
  if (b[0] === 0x20 && b[1] === 0x02) return publicV4(asV4(b.slice(2, 6))) // 2002::/16, 6to4
  return true
}

/** Whether an address is on the public internet; every resolved candidate is checked. */
export function isPublicAddress(ip: string, family: number): boolean {
  return family === 6 ? publicV6(ip) : publicV4(ip)
}

/**
 * The URL if it may be fetched: http or https, without credentials. Ports are not restricted;
 * which hosts are reachable is `isPublicAddress`'s job.
 */
export function checkLinkUrl(raw: string): URL | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  // Credentials would be sent as they are, and in a pasted link they are usually an accident.
  if (u.username !== '' || u.password !== '') return null
  return u
}

/** The host's IP when the host is one: Node skips DNS for it, so the lookup guard never runs. */
export function literalAddress(hostname: string): { ip: string; family: number } | null {
  // A URL brackets an IPv6 host.
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return { ip: hostname.slice(1, -1), family: 6 }
  }
  return /^[0-9.]+$/.test(hostname) ? { ip: hostname, family: 4 } : null
}
