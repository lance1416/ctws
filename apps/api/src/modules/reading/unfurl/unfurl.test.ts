import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { unfurl } from './unfurl'

/**
 * Fetching a page's title. The test servers run on this machine, which the real guard refuses,
 * so these tests pass `allow`; the ones without it check that 127.0.0.1 is never even reached.
 */

const servers: Server[] = []
afterEach(async () => {
  for (const s of servers.splice(0)) await new Promise((done) => s.close(done))
})

const anywhere = () => true

/** Starts a server whose `handler` answers every request, and returns its address. */
async function serve(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ url: string; port: number; hits: string[] }> {
  const hits: string[] = []
  const server = createServer((req, res) => {
    hits.push(req.url ?? '')
    handler(req, res)
  })
  servers.push(server)
  // Dual stack: `localhost` resolves to ::1 or 127.0.0.1 first depending on the machine.
  await new Promise<void>((ready) => server.listen(0, ready))
  const { port } = server.address() as AddressInfo
  return { url: `http://127.0.0.1:${port}`, port, hits }
}

const html = (body: string) => (_req: IncomingMessage, res: ServerResponse) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(body)
}

describe('unfurl', () => {
  it('reads og:title and og:description', async () => {
    const { url } = await serve(
      html(`<html><head><title>站名 | 频道</title>
        <meta property="og:title" content="Linear 怎么重做 issue">
        <meta property="og:description" content="我们把 issue 拆成了三件事。">
        </head><body>x</body></html>`),
    )
    expect(await unfurl(url, { allow: anywhere })).toEqual({
      title: 'Linear 怎么重做 issue',
      summary: '我们把 issue 拆成了三件事。',
    })
  })

  it('reads a name= tag in either attribute order and either quote', async () => {
    const { url } = await serve(
      html(`<html><head>
        <META content='Content first' NAME='OG:TITLE'>
        <meta name="og:description" content="Name, not property">
        </head></html>`),
    )
    expect(await unfurl(url, { allow: anywhere })).toEqual({
      title: 'Content first',
      summary: 'Name, not property',
    })
  })

  it('reads a page built to make a pattern backtrack, at once', async () => {
    const { url } = await serve(
      html(`<html><head>${'<meta content="'.repeat(1100)}<title>Still here</title></head></html>`),
    )
    const began = Date.now()
    await unfurl(url, { allow: anywhere })
    expect(Date.now() - began).toBeLessThan(500)
  })

  it('falls back to <title> and decodes entities', async () => {
    const { url } = await serve(
      html('<html><head><title>A &amp; B &#8212; C</title></head></html>'),
    )
    expect(await unfurl(url, { allow: anywhere })).toEqual({ title: 'A & B — C', summary: null })
  })

  it('decodes a page that is not UTF-8', async () => {
    // GBK is still common, and read as UTF-8 it makes a garbled title.
    const { url } = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=gbk' })
      res.end(Buffer.from('3c7469746c653ebabab2c0b2e9b5c43c2f7469746c653e', 'hex'))
    })
    expect((await unfurl(url, { allow: anywhere }))?.title).toBe('汉怖查的')
  })

  it('does not read a response that is not a page', async () => {
    // The body holds a title, so reading it at all would show.
    const { url } = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"html": "<title>不该读这个</title>"}')
    })
    expect(await unfurl(url, { allow: anywhere })).toBeNull()
  })

  it('follows redirects, up to a limit', async () => {
    const { url, hits } = await serve((req, res) => {
      const n = Number(req.url?.slice(1) ?? 0)
      if (n >= 2) return html('<title>到了</title>')(req, res)
      res.writeHead(302, { location: `/${n + 1}` })
      res.end()
    })
    expect((await unfurl(`${url}/0`, { allow: anywhere }))?.title).toBe('到了')

    const deep = await serve((req, res) => {
      const n = Number(req.url?.slice(1) ?? 0)
      res.writeHead(302, { location: `/${n + 1}` })
      res.end()
    })
    expect(await unfurl(`${deep.url}/0`, { allow: anywhere })).toBeNull()
    expect(deep.hits.length).toBeLessThanOrEqual(4)
    expect(hits.length).toBe(3)
  })

  it('checks every redirect hop, not only the first', async () => {
    const { url, hits } = await serve((req, res) => {
      if (req.url === '/go') {
        res.writeHead(302, { location: 'http://10.0.0.5/internal' })
        res.end()
        return
      }
      html('<title>内网</title>')(req, res)
    })
    // Only the test server is allowed: the redirect to 10.0.0.5 must be refused before connecting.
    const onlyHere = (ip: string) => ip === '127.0.0.1'
    expect(await unfurl(`${url}/go`, { allow: onlyHere })).toBeNull()
    expect(hits).toEqual(['/go'])
  })

  it('gives up on a site that never answers', async () => {
    const { url } = await serve(() => {
      // Not a byte: the capture must come back within the budget.
    })
    const began = Date.now()
    expect(await unfurl(url, { allow: anywhere, timeoutMs: 300 })).toBeNull()
    expect(Date.now() - began).toBeLessThan(2000)
  })

  it('gives up on a site that trickles, at the same budget', async () => {
    const open: { timer: NodeJS.Timeout; res: ServerResponse }[] = []
    const { url } = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      // A byte now and then keeps an idle timeout from ever firing.
      open.push({ timer: setInterval(() => res.write(' '), 100), res })
    })
    const began = Date.now()
    const result = await Promise.race([
      unfurl(url, { allow: anywhere, timeoutMs: 300 }),
      new Promise((done) => setTimeout(() => done('still waiting'), 3000)),
    ])
    for (const { timer, res } of open) {
      clearInterval(timer)
      res.destroy()
    }
    expect(result).toBeNull()
    expect(Date.now() - began).toBeLessThan(2000)
  })

  /**
   * Judged by what was read, not by time or bytes, which loopback makes unreliable: an og:title
   * past the cap would replace <title> if the whole page were read.
   */
  it('reads only the start of the page', async () => {
    const { url } = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.write('<html><head><title>开头就有</title></head><body>')
      res.write('x'.repeat(200 * 1024))
      // Past 128 KB: reading this far would change the title.
      res.end('<meta property="og:title" content="读过头了"></body></html>')
    })
    expect((await unfurl(url, { allow: anywhere }))?.title).toBe('开头就有')
  })

  /** The real guard: without `allow`, this machine is never connected to. */
  it('refuses this machine by default, without connecting', async () => {
    const { url, hits } = await serve(html('<title>内网</title>'))
    expect(await unfurl(url)).toBeNull()
    expect(hits).toEqual([])
  })

  it('ignores anything but http and https', async () => {
    expect(await unfurl('file:///etc/passwd', { allow: anywhere })).toBeNull()
    expect(await unfurl('http://user:pw@example.test/', { allow: anywhere })).toBeNull()
  })

  /**
   * Pins the `lookup` contract: happy-eyeballs asks with `{ all: true }` and wants an array, and
   * a single address fails every domain with "Invalid IP address: undefined". The numeric-host
   * tests above skip DNS and cannot catch it.
   */
  it('fetches a page by domain name', async () => {
    const { port } = await serve(html('<title>域名也行</title>'))
    expect((await unfurl(`http://localhost:${port}/`, { allow: anywhere }))?.title).toBe('域名也行')
  })

  /**
   * Every resolved address is checked, not just the first. `localhost` resolves to ::1 and
   * 127.0.0.1, both refused, in an order that varies; the server listens on both.
   */
  it('refuses a domain that resolves to this machine', async () => {
    const { port, hits } = await serve(html('<title>本机</title>'))
    expect(await unfurl(`http://localhost:${port}/`)).toBeNull()
    expect(hits).toEqual([])
  })

  /** A redirect target goes through every rule again, not only the address check. */
  it('does not follow a redirect to a URL with credentials', async () => {
    const { url, port, hits } = await serve((req, res) => {
      if (req.url === '/go') {
        res.writeHead(302, { location: `http://user:pw@127.0.0.1:${port}/secret` })
        res.end()
        return
      }
      html('<title>不该到这里</title>')(req, res)
    })
    expect(await unfurl(`${url}/go`, { allow: anywhere })).toBeNull()
    expect(hits).toEqual(['/go'])
  })

  /** A numeric host skips DNS, so it is checked separately; this pins that check. */
  it('refuses a numeric private address by default', async () => {
    const { hits } = await serve(html('<title>元数据</title>'))
    expect(await unfurl('http://169.254.169.254/latest/meta-data/')).toBeNull()
    expect(hits).toEqual([])
  })
})
