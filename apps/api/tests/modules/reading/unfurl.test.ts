import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { unfurl } from '../../../src/modules/reading/unfurl/unfurl'

/**
 * 抓一个网页的标题。
 *
 * 测试对着本机起的服务器跑，而本机地址正是那道门要挡的 —— 所以这里把「准不准连」这件事作为参数
 * 传进去（`allow`），路由上接的是真的那一个。最后一条反过来：不传 `allow` 时，127.0.0.1 必须连
 * 都没连过，服务器一个请求都收不到。
 */

const servers: Server[] = []
afterEach(async () => {
  for (const s of servers.splice(0)) await new Promise((done) => s.close(done))
})

const anywhere = () => true

/** 起一个服务器，返回它的地址。`handler` 决定每个请求回什么。 */
async function serve(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ url: string; port: number; hits: string[] }> {
  const hits: string[] = []
  const server = createServer((req, res) => {
    hits.push(req.url ?? '')
    handler(req, res)
  })
  servers.push(server)
  // 双栈：`localhost` 在不同机器上先给 ::1 或先给 127.0.0.1，而那道门两个都该挡。
  await new Promise<void>((ready) => server.listen(0, ready))
  const { port } = server.address() as AddressInfo
  return { url: `http://127.0.0.1:${port}`, port, hits }
}

const html = (body: string) => (_req: IncomingMessage, res: ServerResponse) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(body)
}

describe('unfurl', () => {
  it('og:title 与 og:description 就是那条预览', async () => {
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

  it('没有 og 就用 <title>，并且把实体还原成字符', async () => {
    const { url } = await serve(
      html('<html><head><title>A &amp; B &#8212; C</title></head></html>'),
    )
    expect(await unfurl(url, { allow: anywhere })).toEqual({ title: 'A & B — C', summary: null })
  })

  it('页面不是 UTF-8 也读得对', async () => {
    // 中文站点里 GBK 还活着，按 UTF-8 读会得到一行乱码当标题。
    const { url } = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=gbk' })
      res.end(Buffer.from('3c7469746c653ebabab2c0b2e9b5c43c2f7469746c653e', 'hex'))
    })
    expect((await unfurl(url, { allow: anywhere }))?.title).toBe('汉怖查的')
  })

  it('不是网页就不读它', async () => {
    // 正文里就放着一个标题：读了它就会露馅，所以这一条测的是「根本没读」。
    const { url } = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"html": "<title>不该读这个</title>"}')
    })
    expect(await unfurl(url, { allow: anywhere })).toBeNull()
  })

  it('跟着跳转走，但不无限跟', async () => {
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

  it('跳转的下一跳要重新问那道门，不是只问第一跳', async () => {
    const { url, hits } = await serve((req, res) => {
      if (req.url === '/go') {
        res.writeHead(302, { location: 'http://10.0.0.5/internal' })
        res.end()
        return
      }
      html('<title>内网</title>')(req, res)
    })
    // 只放行测试服务器自己那个地址：302 指向的 10.0.0.5 必须在连之前就被拒掉。
    const onlyHere = (ip: string) => ip === '127.0.0.1'
    expect(await unfurl(`${url}/go`, { allow: onlyHere })).toBeNull()
    expect(hits).toEqual(['/go'])
  })

  it('对面不回话就放弃，而不是把捕获卡在那里', async () => {
    const { url } = await serve(() => {
      // 一个字节都不回：捕获要在预算之内回来。
    })
    const began = Date.now()
    expect(await unfurl(url, { allow: anywhere, timeoutMs: 300 })).toBeNull()
    expect(Date.now() - began).toBeLessThan(2000)
  })

  /**
   * 只读开头那一段。
   *
   * 判据不是时间也不是字节数（loopback 上这两样都不老实），而是**读到了什么**：og:title 放在上限
   * 之后，读过头的话它会盖掉 <title> —— 所以这一条红起来的意思就是「整页都拉下来了」。
   */
  it('只读开头那一段：上限之后的东西根本没被看见', async () => {
    const { url } = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.write('<html><head><title>开头就有</title></head><body>')
      res.write('x'.repeat(200 * 1024))
      // 128 KB 之外：真读到这里，标题就会变成下面这句。
      res.end('<meta property="og:title" content="读过头了"></body></html>')
    })
    expect((await unfurl(url, { allow: anywhere }))?.title).toBe('开头就有')
  })

  /** 这一条是那道门本身：不传 allow 时用真的那一个，本机地址连都不会被连。 */
  it('默认不许连本机，而且是连都没连', async () => {
    const { url, hits } = await serve(html('<title>内网</title>'))
    expect(await unfurl(url)).toBeNull()
    expect(hits).toEqual([])
  })

  it('不是 http(s) 的地址直接就不碰', async () => {
    expect(await unfurl('file:///etc/passwd', { allow: anywhere })).toBeNull()
    expect(await unfurl('http://user:pw@example.test/', { allow: anywhere })).toBeNull()
  })

  /**
   * 地址是域名时真的抓得到。
   *
   * 这一条看着像废话，但它盯的是 `lookup` 的那个约定：Node 的 happy-eyeballs 会带着
   * `{ all: true }` 来问，要的是一个数组；回单个地址的话，每一个域名都会死在
   * 「Invalid IP address: undefined」上 —— 而上面所有用数字地址的用例都照样绿，因为数字地址
   * 根本不走 DNS。
   */
  it('地址是域名时也抓得到', async () => {
    const { port } = await serve(html('<title>域名也行</title>'))
    expect((await unfurl(`http://localhost:${port}/`, { allow: anywhere }))?.title).toBe('域名也行')
  })

  /**
   * 解析出来的地址要一个个问过，而不是拿第一个就连。
   *
   * `localhost` 是域名，所以它走 DNS；它解析出来的 ::1 和 127.0.0.1 都在门外。先给哪一个因机器
   * 而异，所以上面那个服务器是双栈的 —— 两个地址里随便连上哪一个，这一条都该红。
   */
  it('域名解析出来的地址逐个问过，本机解析出来的也不许连', async () => {
    const { port, hits } = await serve(html('<title>本机</title>'))
    expect(await unfurl(`http://localhost:${port}/`)).toBeNull()
    expect(hits).toEqual([])
  })

  /** 跳转之后那个地址要从头走一遍规则，不只是问地址在不在门外。 */
  it('跳到一个带用户名密码的地址就不跟了', async () => {
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

  /** 写成数字的地址不经过 DNS，所以它要在别的地方被问住 —— 这一条就是问住了没有。 */
  it('默认也不许连写成数字的内网地址', async () => {
    const { hits } = await serve(html('<title>元数据</title>'))
    expect(await unfurl('http://169.254.169.254/latest/meta-data/')).toBeNull()
    expect(hits).toEqual([])
  })
})
