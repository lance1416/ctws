import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { s3Store, type ObjectStore } from '../../src/platform/storage'
import { sweepFiles } from '../../src/shell/files'
import { createPerson } from '../helpers/builders'
import { appWithUser, secondUser, type Harness } from '../helpers/harness'
import { withGarage } from '../helpers/storage'

/**
 * Photos, against a real Garage: kept cut, scaled and clean; read only by their own workspace;
 * taken off with a minute to put them back; and gone from the store once let go of.
 */

const START = new Date('2026-11-04T09:00:00Z')
let garage: Awaited<ReturnType<typeof withGarage>>
let store: ObjectStore

beforeAll(async () => {
  garage = await withGarage()
  store = s3Store(garage.config)
}, 120_000)

afterAll(async () => {
  await garage?.stop()
})

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

/** An app with storage whose clock the test moves. */
async function setup(opts: { storage?: boolean } = {}) {
  const clock = { now: START }
  const ctx = await appWithUser('me@example.com', {
    clock: () => clock.now,
    ...(opts.storage === false ? {} : { storage: store }),
  })
  cleanups.push(ctx.stop)
  const later = (ms: number) => (clock.now = new Date(clock.now.getTime() + ms))
  return { ctx, clock, later }
}

/** A phone photo: 400 by 200 as stored, turned on its side, saying what took it. */
async function phonePhoto() {
  return sharp({ create: { width: 400, height: 200, channels: 3, background: '#c00' } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExifMerge({ IFD0: { Make: 'Phone', Model: 'Phone 99' } })
    .toBuffer()
}

const CROP = 'x=0&y=0&size=200'

const put = (ctx: Harness, url: string, body: Buffer, type = 'application/octet-stream') =>
  ctx.app.inject({
    method: 'PUT',
    url,
    headers: { ...ctx.authed, 'content-type': type },
    payload: body,
  })

const call = (ctx: Harness, method: 'GET' | 'DELETE' | 'POST', url: string, payload?: object) =>
  ctx.app.inject({ method, url, headers: ctx.authed, ...(payload ? { payload } : {}) })

const me = async (ctx: Harness) => (await call(ctx, 'GET', '/api/v1/auth/me')).json()

/** Where a photo is kept, read straight from the table, to look in the store behind the api. */
async function keyOf(ctx: Harness, id: string): Promise<string> {
  const r = await ctx.db.execute(sql`select key from files where id = ${id}::uuid`)
  return String(r.rows[0]?.key ?? `gone:${id}`)
}

async function setMine(ctx: Harness): Promise<string> {
  const res = await put(ctx, `/api/v1/me/avatar?${CROP}`, await phonePhoto())
  expect(res.statusCode, res.body).toBe(200)
  return res.json().avatarId
}

describe('the account photo', () => {
  it('is kept as a square WebP of 512, upright, with nothing of the file but its pixels', async () => {
    const { ctx } = await setup()
    const id = await setMine(ctx)
    expect(await me(ctx)).toMatchObject({ avatarId: id, photos: true })

    const res = await call(ctx, 'GET', `/api/v1/avatars/${id}`)
    expect(res.statusCode).toBe(200)
    expect(res.headers).toMatchObject({
      'content-type': 'image/webp',
      'cache-control': 'private, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    })
    const meta = await sharp(res.rawPayload).metadata()
    expect(meta).toMatchObject({ format: 'webp', width: 512, height: 512 })
    expect(meta.exif).toBeUndefined()
    expect(res.rawPayload.includes('Phone 99')).toBe(false)
  })

  it('takes the file as the browser sends it, under its own image type', async () => {
    const { ctx } = await setup()
    const res = await put(ctx, `/api/v1/me/avatar?${CROP}`, await phonePhoto(), 'image/jpeg')
    expect(res.statusCode, res.body).toBe(200)
  })

  it('refuses an SVG, whatever it is sent as', async () => {
    const { ctx } = await setup()
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>')
    const res = await put(ctx, `/api/v1/me/avatar?${CROP}`, svg, 'image/png')
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({
      type: 'urn:ctws:problem:unsupported-image',
      title: "That file isn't a JPEG, PNG, WebP or GIF image.",
    })
  })

  it('refuses a square that does not fit the upright picture, rather than fixing it', async () => {
    const { ctx } = await setup()
    // As stored the picture is 400 wide; upright it is 200, so 300 does not fit.
    const res = await put(ctx, '/api/v1/me/avatar?x=0&y=0&size=300', await phonePhoto())
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ type: 'urn:ctws:problem:bad-crop' })
  })

  it('refuses a file over 10 MB before reading it', async () => {
    const { ctx } = await setup()
    const big = Buffer.concat([await phonePhoto(), Buffer.alloc(10 * 1024 * 1024)])
    expect((await put(ctx, `/api/v1/me/avatar?${CROP}`, big)).statusCode).toBe(413)
  })

  it('is read only by its own workspace: another gets what a made-up id gets', async () => {
    const { ctx } = await setup()
    const id = await setMine(ctx)
    const other = await secondUser(ctx)
    const theirs = await call(other, 'GET', `/api/v1/avatars/${id}`)
    const nobody = await call(ctx, 'GET', '/api/v1/avatars/01a1a42a-0000-7000-8000-000000000000')
    expect(theirs.statusCode).toBe(404)
    expect(nobody.statusCode).toBe(404)
    expect(theirs.json()).toEqual(nobody.json())
  })

  it('lets the old file go when replaced, and the sweep removes it', async () => {
    const { ctx, clock } = await setup()
    const first = await setMine(ctx)
    const key = await keyOf(ctx, first)
    const second = await setMine(ctx)
    expect(second).not.toBe(first)
    expect(await store.get(key)).not.toBeNull()
    await sweepFiles(ctx.db, store, clock.now)
    expect(await store.get(key)).toBeNull()
    expect((await call(ctx, 'GET', `/api/v1/avatars/${first}`)).statusCode).toBe(404)
    expect((await call(ctx, 'GET', `/api/v1/avatars/${second}`)).statusCode).toBe(200)
  })
})

describe('taking a photo off', () => {
  it('shows initials at once, and puts the same photo back within the minute', async () => {
    const { ctx, clock, later } = await setup()
    const id = await setMine(ctx)
    const off = await call(ctx, 'DELETE', '/api/v1/me/avatar')
    expect(off.statusCode).toBe(200)
    expect(await me(ctx)).toMatchObject({ avatarId: null })

    later(59_000)
    // A sweep in the minute leaves it alone.
    await sweepFiles(ctx.db, store, clock.now)
    const back = await call(ctx, 'POST', '/api/v1/me/avatar/restore', off.json())
    expect(back.statusCode, back.body).toBe(200)
    expect(back.json()).toEqual({ avatarId: id })
    expect(await me(ctx)).toMatchObject({ avatarId: id })
    expect((await call(ctx, 'GET', `/api/v1/avatars/${id}`)).statusCode).toBe(200)
  })

  it('cannot be undone after the minute, and the sweep then removes the file', async () => {
    const { ctx, clock, later } = await setup()
    const id = await setMine(ctx)
    const key = await keyOf(ctx, id)
    const off = (await call(ctx, 'DELETE', '/api/v1/me/avatar')).json()
    later(60_000)
    const res = await call(ctx, 'POST', '/api/v1/me/avatar/restore', off)
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({
      type: 'urn:ctws:problem:undo-expired',
      title: 'That can no longer be undone.',
    })
    expect(await sweepFiles(ctx.db, store, clock.now)).toBe(1)
    expect(await store.get(key)).toBeNull()
    expect(await me(ctx)).toMatchObject({ avatarId: null })
  })

  it('cannot be undone once another photo has taken its place', async () => {
    const { ctx } = await setup()
    await setMine(ctx)
    const off = (await call(ctx, 'DELETE', '/api/v1/me/avatar')).json()
    const newer = await setMine(ctx)
    const res = await call(ctx, 'POST', '/api/v1/me/avatar/restore', off)
    expect(res.statusCode).toBe(409)
    expect(await me(ctx)).toMatchObject({ avatarId: newer })
  })

  it('is a 404 with no photo on', async () => {
    const { ctx } = await setup()
    expect((await call(ctx, 'DELETE', '/api/v1/me/avatar')).statusCode).toBe(404)
  })
})

describe("a person's photo", () => {
  it('shows on the person, and only to their own workspace', async () => {
    const { ctx } = await setup()
    const lena = await createPerson(ctx, { name: 'Lena' })
    const res = await put(ctx, `/api/v1/people/${lena.id}/avatar?${CROP}`, await phonePhoto())
    expect(res.statusCode, res.body).toBe(200)
    const { avatarId } = res.json()
    const read = await call(ctx, 'GET', `/api/v1/people/${lena.id}`)
    expect(read.json()).toMatchObject({ avatarId })

    const other = await secondUser(ctx)
    const theirs = await put(other, `/api/v1/people/${lena.id}/avatar?${CROP}`, await phonePhoto())
    expect(theirs.statusCode).toBe(404)
    expect((await call(other, 'GET', `/api/v1/avatars/${avatarId}`)).statusCode).toBe(404)
  })

  it('is put back only on the one it was taken off', async () => {
    const { ctx } = await setup()
    const lena = await createPerson(ctx, { name: 'Lena' })
    const priya = await createPerson(ctx, { name: 'Priya' })
    await put(ctx, `/api/v1/people/${lena.id}/avatar?${CROP}`, await phonePhoto())
    const off = (await call(ctx, 'DELETE', `/api/v1/people/${lena.id}/avatar`)).json()
    const wrong = await call(ctx, 'POST', `/api/v1/people/${priya.id}/avatar/restore`, off)
    expect(wrong.statusCode).toBe(409)
    const mine = await call(ctx, 'POST', '/api/v1/me/avatar/restore', off)
    expect(mine.statusCode).toBe(409)
    const right = await call(ctx, 'POST', `/api/v1/people/${lena.id}/avatar/restore`, off)
    expect(right.statusCode).toBe(200)
  })

  it('goes from the store with the person', async () => {
    const { ctx, clock } = await setup()
    const lena = await createPerson(ctx, { name: 'Lena' })
    const res = await put(ctx, `/api/v1/people/${lena.id}/avatar?${CROP}`, await phonePhoto())
    const key = await keyOf(ctx, res.json().avatarId)
    expect((await call(ctx, 'DELETE', `/api/v1/people/${lena.id}`)).statusCode).toBe(204)
    expect(await sweepFiles(ctx.db, store, clock.now)).toBe(1)
    expect(await store.get(key)).toBeNull()
  })

  it('is null for someone who has none', async () => {
    const { ctx } = await setup()
    const priya = await createPerson(ctx, { name: 'Priya Shah' })
    expect(priya).toMatchObject({ avatarId: null })
  })
})

describe('a server with no storage', () => {
  it('says photos are off, refuses one, and runs everything else', async () => {
    const { ctx } = await setup({ storage: false })
    expect(await me(ctx)).toMatchObject({ photos: false, avatarId: null })
    const res = await put(ctx, `/api/v1/me/avatar?${CROP}`, await phonePhoto())
    expect(res.statusCode).toBe(503)
    expect(res.json()).toMatchObject({
      type: 'urn:ctws:problem:photos-off',
      title: "Photos need file storage, which this server doesn't have set up.",
    })
    expect((await createPerson(ctx, { name: 'Lena' })).avatarId).toBeNull()
  })
})

describe('the sweep', () => {
  it('keeps a file the store fails to remove, for the next sweep', async () => {
    const { ctx, clock } = await setup()
    const first = await setMine(ctx)
    const key = await keyOf(ctx, first)
    await setMine(ctx)
    const down: ObjectStore = { ...store, remove: () => Promise.reject(new Error('down')) }
    expect(await sweepFiles(ctx.db, down, clock.now)).toBe(0)
    expect(await sweepFiles(ctx.db, store, clock.now)).toBe(1)
    expect(await store.get(key)).toBeNull()
  })
})
