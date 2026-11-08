import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { DomainError } from '../errors'
import type { StorageConfig } from './config'

/**
 * The store did not do what was asked of it: it is down, the key is refused, or it answered with
 * an error. The server is fine, so this is a 503, not a 500 that reads as a bug in the app.
 */
export class StorageUnreachable extends DomainError {
  constructor() {
    super('unavailable', {
      type: 'urn:ctws:problem:storage-unreachable',
      title: "The file storage isn't answering.",
    })
  }
}

/** The work of a store call, with whatever goes wrong in it said as `StorageUnreachable`. */
const reaching = <T>(work: Promise<T>): Promise<T> =>
  work.catch((error: unknown) => {
    throw error instanceof DomainError ? error : new StorageUnreachable()
  })

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
      await reaching(
        client.send(
          new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }),
        ),
      )
    },

    async get(key) {
      return reaching(
        (async () => {
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
        })(),
      )
    },

    async remove(key) {
      await reaching(client.send(new DeleteObjectCommand({ Bucket, Key: key })))
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
