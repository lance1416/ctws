import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { s3Store, type ObjectStore } from '../../src/platform/storage'
import { withApp } from '../helpers/app'
import { withGarage } from '../helpers/storage'

let garage: Awaited<ReturnType<typeof withGarage>>
let store: ObjectStore

beforeAll(async () => {
  garage = await withGarage()
  store = s3Store(garage.config)
}, 120_000)

afterAll(async () => {
  await garage?.stop()
})

describe('the S3 store, against Garage', () => {
  it('reads back what was put, with its type', async () => {
    const body = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 1, 2, 3])
    await store.put('avatars/w/a.webp', body, 'image/webp')
    expect(await store.get('avatars/w/a.webp')).toEqual({ body, contentType: 'image/webp' })
  })

  it('has nothing for a key never put', async () => {
    expect(await store.get('avatars/w/never.webp')).toBeNull()
  })

  it('removes a file, and removing it again is not an error', async () => {
    await store.put('avatars/w/b.webp', Buffer.from('x'), 'image/webp')
    await store.remove('avatars/w/b.webp')
    expect(await store.get('avatars/w/b.webp')).toBeNull()
    await expect(store.remove('avatars/w/b.webp')).resolves.toBeUndefined()
  })

  it('is ready when the bucket answers', async () => {
    expect(await store.probe()).toBe('ready')
  })

  it('is unreachable with the wrong key, or nothing listening', async () => {
    const wrongKey = s3Store({ ...garage.config, secretAccessKey: 'not-the-secret-0000' })
    expect(await wrongKey.probe()).toBe('unreachable')
    const nobody = s3Store({ ...garage.config, endpoint: 'http://127.0.0.1:9' })
    expect(await nobody.probe()).toBe('unreachable')
  })
})

describe('/health', () => {
  it('says storage is off when the server has none', async () => {
    const ctx = await withApp()
    try {
      const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/health' })
      expect(res.json()).toMatchObject({ status: 'ok', storage: 'off' })
    } finally {
      await ctx.stop()
    }
  })

  it('says whether the store answers, and stays up when it does not', async () => {
    const ready = await withApp({}, { storage: store })
    const down = await withApp(
      {},
      { storage: s3Store({ ...garage.config, endpoint: 'http://127.0.0.1:9' }) },
    )
    try {
      const up = await ready.app.inject({ method: 'GET', url: '/api/v1/health' })
      expect(up.json()).toMatchObject({ status: 'ok', storage: 'ready' })
      const res = await down.app.inject({ method: 'GET', url: '/api/v1/health' })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ status: 'ok', storage: 'unreachable' })
    } finally {
      await ready.stop()
      await down.stop()
    }
  })
})
