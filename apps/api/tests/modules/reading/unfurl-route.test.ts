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

/** The real fetch, allowed to reach this machine. */
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

describe('a pasted link reads back its own title', () => {
  it('stores the fetched title and summary, and reads them back', async () => {
    const ctx = await setupWith(cleanups, undefined, { unfurl: fetchAnywhere })
    const url = await page(
      `<html><head><meta property="og:title" content="Linear 怎么重做 issue">
       <meta property="og:description" content="我们把 issue 拆成了三件事。"></head></html>`,
    )
    const made = await add(ctx, { kind: 'link', url })
    expect(made.fetchedTitle).toBe('Linear 怎么重做 issue')
    expect(made.fetchedSummary).toBe('我们把 issue 拆成了三件事。')
    // Stored, not only in this response.
    expect((await list(ctx))[0]?.fetchedTitle).toBe('Linear 怎么重做 issue')
  })

  it('keeps the item when the site does not answer', async () => {
    const ctx = await setupWith(cleanups, undefined, { unfurl: fetchAnywhere })
    // Nothing listens on this port.
    const made = await add(ctx, { kind: 'link', url: 'http://127.0.0.1:9/nothing' })
    expect(made.fetchedTitle).toBeNull()
    expect(made.url).toBe('http://127.0.0.1:9/nothing')
    expect(await list(ctx)).toHaveLength(1)
  })

  /** A silent site and a fetch that throws are different failures; neither may lose the item. */
  it('keeps the item when the fetch throws', async () => {
    const ctx = await setupWith(cleanups, undefined, {
      unfurl: () => Promise.reject(new Error('boom')),
    })
    const made = await add(ctx, { kind: 'link', url: 'https://example.invalid/a' })
    expect(made.fetchedTitle).toBeNull()
    expect(await list(ctx)).toHaveLength(1)
  })

  it('does not fetch when the person wrote a title', async () => {
    const ctx = await setupWith(cleanups, undefined, { unfurl: fetchAnywhere })
    const url = await page('<title>对面说的</title>')
    const made = await add(ctx, { kind: 'link', url, title: '我自己说的' })
    expect(made.title).toBe('我自己说的')
    expect(made.fetchedTitle).toBeNull()
  })

  it('does not fetch for a book, which has no address', async () => {
    const ctx = await setupWith(cleanups, undefined, { unfurl: fetchAnywhere })
    const made = await add(ctx, { kind: 'book', title: '人月神话' })
    expect(made.fetchedTitle).toBeNull()
  })

  it('never fetches when turned off', async () => {
    const ctx = await setupWith(cleanups, undefined, {
      env: { readingUnfurl: false },
      unfurl: fetchAnywhere,
    })
    const url = await page('<title>不该被读到</title>')
    const made = await add(ctx, { kind: 'link', url })
    expect(made.fetchedTitle).toBeNull()
  })
})
