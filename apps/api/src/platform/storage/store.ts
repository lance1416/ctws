import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import type { StorageConfig } from './config'

/** One stored file, as read back. */
type StoredObject = { body: Buffer; contentType: string }

/** Whether the store answers right now, for `/health`. */
type StorageState = 'ready' | 'unreachable'

/** The few things the app does with files: no listing, no versions, no public links. */
export type ObjectStore = {
  put(key: string, body: Buffer, contentType: string): Promise<void>
  /** `null` when there is no such file. */
  get(key: string): Promise<StoredObject | null>
  /** Gone afterwards either way: removing a file that is not there is not an error. */
  remove(key: string): Promise<void>
  probe(): Promise<StorageState>
}

// A health check that waits on a dead store must still answer inside the container's own
// healthcheck timeout (5s), or a storage outage would read as the api being down.
const PROBE_TIMEOUT_MS = 2000

/** A store over any S3-compatible service. */
export function s3Store(config: StorageConfig): ObjectStore {
  const client = new S3Client({
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // Since 3.729 the SDK adds CRC checksums to every upload and checks them on every download by
    // default; not every S3-compatible service speaks those headers. Only where S3 demands one.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
  const Bucket = config.bucket

  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }),
      )
    },

    async get(key) {
      try {
        const out = await client.send(new GetObjectCommand({ Bucket, Key: key }))
        if (!out.Body) return null
        return {
          body: Buffer.from(await out.Body.transformToByteArray()),
          contentType: out.ContentType ?? 'application/octet-stream',
        }
      } catch (error) {
        if (error instanceof NoSuchKey) return null
        throw error
      }
    },

    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }))
    },

    async probe() {
      try {
        await client.send(new HeadBucketCommand({ Bucket }), {
          abortSignal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        })
        return 'ready'
      } catch {
        return 'unreachable'
      }
    },
  }
}
