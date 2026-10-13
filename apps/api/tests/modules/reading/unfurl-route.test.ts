import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { ReadingItemResponse } from '@ctws/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { unfurl } from '../../../src/modules/reading/unfurl/unfurl'
import { setupWith, type Harness, web } from '../../helpers/harness'

/**
 * A pasted link shows what its own page says. The fetch itself is tested in
 * `src/modules/reading/unfurl/unfurl.test.ts`; this covers the wiring: what is fetched is stored
 * and read back, a failed fetch never loses the item, and a title the person wrote is never
 * overwritten.
 *
 * The test server is on 127.0.0.1, which production refuses, so the fetch is passed in from
 * outside; the production path has no switch.
 */

const cleanups: (() => Promise<void>)[] = []
const servers: Server[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
  for (const s of servers.splice(0)) await new Promise((done) => s.close(done))
})

/** 真的去抓，只是把「准不准连」放开到本机。 */
const fetchAnywhere = (url: string) => unfurl(url, { allow: () => true })

async function page(body: string): Promise<string> {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(body)
  })
  servers.push(server)
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/a/b`
}

async function add(ctx: Harness, payload: Record<string, unknown>): Promise<ReadingItemResponse> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/reading',
    headers: web(ctx),
    payload,
  })
  expect(res.statusCode, res.body).toBe(201)
  return res.json() as ReadingItemResponse
}

const list = async (ctx: Harness): Promise<ReadingItemResponse[]> => {
  const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/reading', headers: ctx.authed })
  return (res.json() as { items: ReadingItemResponse[] }).items
}

describe('粘一条链接时把对面的标题读回来', () => {
  it('抓到的标题和那句话存下来，而且读得回去', async () => {
    const ctx = await setupWith(cleanups, undefined, { unfurl: fetchAnywhere })
    const url = await page(
      `<html><head><meta property="og:title" content="Linear 怎么重做 issue">
       <meta property="og:description" content="我们把 issue 拆成了三件事。"></head></html>`,
    )
    const made = await add(ctx, { kind: 'link', url })
    expect(made.fetchedTitle).toBe('Linear 怎么重做 issue')
    expect(made.fetchedSummary).toBe('我们把 issue 拆成了三件事。')
    // 存下来了，不是只在这一次响应里。
    expect((await list(ctx))[0]?.fetchedTitle).toBe('Linear 怎么重做 issue')
  })

  it('抓不到也要有这一条：捕获不能因为对面没回话就失败', async () => {
    const ctx = await setupWith(cleanups, undefined, { unfurl: fetchAnywhere })
    // 这个端口上什么都没有。
    const made = await add(ctx, { kind: 'link', url: 'http://127.0.0.1:9/nothing' })
    expect(made.fetchedTitle).toBeNull()
    expect(made.url).toBe('http://127.0.0.1:9/nothing')
    expect(await list(ctx)).toHaveLength(1)
  })

  /** 对面不回话是一回事，抓取这段代码自己抛了是另一回事 —— 两种都不能把这一条弄丢。 */
  it('抓取抛错也要有这一条', async () => {
    const ctx = await setupWith(cleanups, undefined, {
      unfurl: () => Promise.reject(new Error('boom')),
    })
    const made = await add(ctx, { kind: 'link', url: 'https://example.invalid/a' })
    expect(made.fetchedTitle).toBeNull()
    expect(await list(ctx)).toHaveLength(1)
  })

  it('人自己写了标题就不去抓：他已经说了这是什么', async () => {
    const ctx = await setupWith(cleanups, undefined, { unfurl: fetchAnywhere })
    const url = await page('<title>对面说的</title>')
    const made = await add(ctx, { kind: 'link', url, title: '我自己说的' })
    expect(made.title).toBe('我自己说的')
    expect(made.fetchedTitle).toBeNull()
  })

  it('书不抓：它没有地址', async () => {
    const ctx = await setupWith(cleanups, undefined, { unfurl: fetchAnywhere })
    const made = await add(ctx, { kind: 'book', title: '人月神话' })
    expect(made.fetchedTitle).toBeNull()
  })

  it('关掉之后一次都不抓', async () => {
    const ctx = await setupWith(cleanups, undefined, {
      env: { readingUnfurl: false },
      unfurl: fetchAnywhere,
    })
    const url = await page('<title>不该被读到</title>')
    const made = await add(ctx, { kind: 'link', url })
    expect(made.fetchedTitle).toBeNull()
  })
})
