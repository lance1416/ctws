import { describe, expect, it } from 'vitest'
import { storageConfig } from './config'

const full = {
  S3_BUCKET: 'ctws',
  S3_ACCESS_KEY_ID: 'GKexample',
  S3_SECRET_ACCESS_KEY: 'secret-secret-secret',
}

describe('storageConfig', () => {
  it('is off with nothing set, or everything set empty', () => {
    expect(storageConfig({})).toBeNull()
    expect(
      storageConfig({ S3_BUCKET: '', S3_ACCESS_KEY_ID: '', S3_SECRET_ACCESS_KEY: '' }),
    ).toBeNull()
  })

  it('is on with a bucket and both keys, defaulting to us-east-1, path-style, no endpoint', () => {
    expect(storageConfig(full)).toEqual({
      endpoint: undefined,
      region: 'us-east-1',
      bucket: 'ctws',
      accessKeyId: 'GKexample',
      secretAccessKey: 'secret-secret-secret',
      forcePathStyle: true,
    })
  })

  it('takes an endpoint, a region and virtual-host style', () => {
    expect(
      storageConfig({
        ...full,
        S3_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
        S3_REGION: 'auto',
        S3_FORCE_PATH_STYLE: 'false',
      }),
    ).toMatchObject({
      endpoint: 'https://acct.r2.cloudflarestorage.com',
      region: 'auto',
      forcePathStyle: false,
    })
  })

  it('refuses to start half set up, naming what is missing', () => {
    expect(() => storageConfig({ S3_BUCKET: 'ctws' })).toThrow(
      /S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY missing/,
    )
    expect(() => storageConfig({ ...full, S3_SECRET_ACCESS_KEY: '' })).toThrow(
      /S3_SECRET_ACCESS_KEY missing/,
    )
  })

  it('refuses an endpoint that is not a URL', () => {
    expect(() => storageConfig({ ...full, S3_ENDPOINT: 'storage:3900' })).toThrow(/S3_ENDPOINT/)
  })
})
