import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import sharp from 'sharp'
import { sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { s3Store, type ObjectStore } from '../../src/platform/storage'
import { sweepFiles } from '../../src/shell/files'
import { outsidePreviewer, previewPending } from '../../src/shell/resources'
import { createProject } from '../helpers/builders'
import { setupWith, type Harness } from '../helpers/harness'
import { withGarage } from '../helpers/storage'

/**
 * A link's card: read from the page in the background, its pictures fetched past the same
 * guards, made anew and kept in the store, never loaded from the other site by the page.
 */

let garage: Awaited<ReturnType<typeof withGarage>>
let store: ObjectStore
let site: { url: string; hits: string[]; server: Server }

const routes = new Map<string, (res: ServerResponse) => void>()

beforeAll(async () => {
  garage = await withGarage()
  store = s3Store(garage.config)
  const hits: string[] = []
  const server = createServer((req: IncomingMessage, res) => {
    hits.push(req.url ?? '')
    const route = routes.get(req.url ?? '')
    if (route) return route(res)
    res.writeHead(404).end()
  })
  await new Promise<void>((ready) => server.listen(0, ready))
  site = { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, hits, server }
}, 120_000)

afterAll(async () => {
  await new Promise((done) => site?.server.close(done))
  await garage?.stop()
})

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
  routes.clear()
  site.hits.splice(0)
})

const send = (type: string, body: Buffer | string) => (res: ServerResponse) => {
  res.writeHead(200, { 'content-type': type })
  res.end(body)
}

const png = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: '#c00' } })
    .png()
    .toBuffer()

/** A page that describes itself fully, its icon and its picture beside it. */
async function aPage(path = '/post') {
  routes.set(
    path,
    send(
      'text/html; charset=utf-8',
      `<html><head>
        <meta property="og:title" content="Atlas design notes">
        <meta property="og:site_name" content="Example Blog">
        <meta property="og:image" content="/cover.png">
        <link rel="shortcut icon" href="/icon.png">
      </head></html>`,
    ),
  )
  routes.set('/icon.png', send('image/png', await png(32, 32)))
  routes.set('/cover.png', send('image/png', await png(2400, 1260)))
  return `${site.url}${path}`
}

// The test site is on this machine, which the real guard refuses: these tests let it through.
const previews = outsidePreviewer({ allow: () => true })

async function setup(opts: { storage?: boolean } = {}) {
  const ctx = await setupWith(cleanups, 'me@example.com', {
    previews,
    ...(opts.storage === false ? {} : { storage: store }),
  })
  const projectId = await createProject(ctx, 'Atlas')
  return { ctx, projectId }
}

const add = async (ctx: Harness, owner: object, url: string) => {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/resources',
    headers: ctx.authed,
    payload: { owner, url },
  })
  expect(res.statusCode, res.body).toBe(201)
  return res.json()
}

const listed = async (ctx: Harness, projectId: string) =>
  (
    await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/resources?type=project&id=${projectId}`,
      headers: ctx.authed,
    })
  ).json().resources

/** Waits for the fetch the create started, then reads the resource back. */
async function settled(ctx: Harness, projectId: string) {
  for (let i = 0; i < 100; i++) {
    const [r] = await listed(ctx, projectId)
    if (r.previewState !== 'pending') return r
    await new Promise((later) => setTimeout(later, 50))
  }
  throw new Error('the card never came')
}

describe('a link card', () => {
  it('is waiting at once, then has the page title, the site, an icon and a picture', async () => {
    const { ctx, projectId } = await setup()
    const made = await add(ctx, { type: 'project', id: projectId }, await aPage())
    expect(made).toMatchObject({ previewState: 'pending', preview: null })

    const card = await settled(ctx, projectId)
    expect(card).toMatchObject({
      previewState: 'done',
      preview: {
        title: 'Atlas design notes',
        siteName: 'Example Blog',
        iconId: expect.any(String),
        imageId: expect.any(String),
      },
    })

    const icon = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/files/${card.preview.iconId}`,
      headers: ctx.authed,
    })
    expect(icon.statusCode).toBe(200)
    expect(await sharp(icon.rawPayload).metadata()).toMatchObject({
      format: 'webp',
      width: 64,
      height: 64,
    })
    const picture = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/files/${card.preview.imageId}`,
      headers: ctx.authed,
    })
    expect(await sharp(picture.rawPayload).metadata()).toMatchObject({ width: 1200, height: 630 })
  })

  it("takes the site's /favicon.ico when the page names no icon, its PNG inside", async () => {
    const { ctx, projectId } = await setup()
    routes.set('/plain', send('text/html', '<title>Plain page</title>'))
    const inner = await png(16, 16)
    const ico = Buffer.alloc(22)
    ico.writeUInt16LE(1, 2)
    ico.writeUInt16LE(1, 4)
    ico[6] = 16
    ico.writeUInt32LE(inner.length, 14)
    ico.writeUInt32LE(22, 18)
    routes.set('/favicon.ico', send('image/x-icon', Buffer.concat([ico, inner])))
    await add(ctx, { type: 'project', id: projectId }, `${site.url}/plain`)
    expect(await settled(ctx, projectId)).toMatchObject({
      preview: { title: 'Plain page', iconId: expect.any(String), imageId: null },
    })
  })

  it('keeps no SVG icon and no picture over 1 MB', async () => {
    const { ctx, projectId } = await setup()
    routes.set(
      '/svg',
      send(
        'text/html',
        '<title>T</title><link rel="icon" href="/i.svg"><meta property="og:image" content="/big.png">',
      ),
    )
    routes.set('/i.svg', send('image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"/>'))
    routes.set(
      '/big.png',
      send('image/png', Buffer.concat([await png(10, 10), Buffer.alloc(1_100_000)])),
    )
    await add(ctx, { type: 'project', id: projectId }, `${site.url}/svg`)
    expect(await settled(ctx, projectId)).toMatchObject({
      previewState: 'done',
      preview: { title: 'T', iconId: null, imageId: null },
    })
  })

  it('stays a plain link when the page gives nothing', async () => {
    const { ctx, projectId } = await setup()
    await add(ctx, { type: 'project', id: projectId }, `${site.url}/missing`)
    expect(await settled(ctx, projectId)).toMatchObject({ previewState: 'none', preview: null })
  })

  it('has a title and site but no pictures on a server without storage', async () => {
    const { ctx, projectId } = await setup({ storage: false })
    await add(ctx, { type: 'project', id: projectId }, await aPage())
    expect(await settled(ctx, projectId)).toMatchObject({
      preview: { title: 'Atlas design notes', iconId: null, imageId: null },
    })
  })
})

describe('with fetching off', () => {
  it('a resource is a plain link from the start, and nothing is fetched', async () => {
    const ctx = await setupWith(cleanups, 'me@example.com', { storage: store })
    const projectId = await createProject(ctx, 'Atlas')
    const made = await add(ctx, { type: 'project', id: projectId }, await aPage())
    expect(made).toMatchObject({ previewState: 'none', preview: null })
    await new Promise((later) => setTimeout(later, 200))
    expect(site.hits).toEqual([])
  })
})

describe('when the address changes, or the card is asked for again', () => {
  it('fetches the new page and lets the old pictures go', async () => {
    const { ctx, projectId } = await setup()
    const made = await add(ctx, { type: 'project', id: projectId }, await aPage('/one'))
    const first = await settled(ctx, projectId)
    await aPage('/two')
    const moved = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/resources/${made.id}`,
      headers: ctx.authed,
      payload: { url: `${site.url}/two` },
    })
    expect(moved.json()).toMatchObject({ previewState: 'pending', preview: null })
    const second = await settled(ctx, projectId)
    expect(second.preview.iconId).not.toBe(first.preview.iconId)
    await sweepFiles(ctx.db, store, new Date(Date.now() + 1000))
    const old = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/files/${first.preview.iconId}`,
      headers: ctx.authed,
    })
    expect(old.statusCode).toBe(404)
  })

  it('fetches again on Refresh preview', async () => {
    const { ctx, projectId } = await setup()
    const made = await add(ctx, { type: 'project', id: projectId }, await aPage())
    await settled(ctx, projectId)
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/resources/${made.id}/refresh-preview`,
      headers: ctx.authed,
    })
    expect(res.json()).toMatchObject({ previewState: 'pending' })
    expect(await settled(ctx, projectId)).toMatchObject({ previewState: 'done' })
  })
})

describe('a picture lost from the store', () => {
  it('is a 404, and its card goes back to be fetched again', async () => {
    const { ctx, projectId } = await setup()
    await add(ctx, { type: 'project', id: projectId }, await aPage())
    const card = await settled(ctx, projectId)
    const r = await ctx.db.execute(
      sql`select key from files where id = ${card.preview.iconId}::uuid`,
    )
    await store.remove(String(r.rows[0]!.key))
    const lost = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/files/${card.preview.iconId}`,
      headers: ctx.authed,
    })
    expect(lost.statusCode).toBe(404)
    expect((await listed(ctx, projectId))[0]).toMatchObject({ previewState: 'pending' })
    await previewPending(ctx.db, store, previews, () => new Date())
    expect(await settled(ctx, projectId)).toMatchObject({ previewState: 'done' })
  })
})

describe('deleting', () => {
  it('a resource lets its pictures go, and so does deleting the thing it hung on', async () => {
    const { ctx, projectId } = await setup()
    const one = await add(ctx, { type: 'project', id: projectId }, await aPage())
    await settled(ctx, projectId)
    await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/resources/${one.id}`,
      headers: ctx.authed,
    })
    const other = await createProject(ctx, 'Other')
    await add(ctx, { type: 'project', id: other }, await aPage())
    await settled(ctx, other)
    await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${other}`,
      headers: ctx.authed,
    })
    expect(await sweepFiles(ctx.db, store, new Date(Date.now() + 1000))).toBe(4)
  })
})

describe('the guard', () => {
  it('keeps the real previewer off this machine: the card is none, and the site is never asked', async () => {
    const ctx = await setupWith(cleanups, 'me@example.com', {
      storage: store,
      previews: outsidePreviewer(),
    })
    const projectId = await createProject(ctx, 'Atlas')
    await add(ctx, { type: 'project', id: projectId }, await aPage())
    expect(await settled(ctx, projectId)).toMatchObject({ previewState: 'none' })
    expect(site.hits).toEqual([])
  })
})
