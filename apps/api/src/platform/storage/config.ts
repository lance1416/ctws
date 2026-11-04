import { z } from 'zod'
import { envFlag } from '../config'

const raw = z.object({
  // Unset for AWS itself; any other S3-compatible service names its own (Garage, R2, B2).
  S3_ENDPOINT: z.string().optional(),
  // Garage in the compose files answers to us-east-1 too, so only R2 (`auto`) and AWS buckets
  // elsewhere need this set.
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  // A self-hosted store has no per-bucket hostnames; AWS, R2 and B2 take path-style as well.
  S3_FORCE_PATH_STYLE: envFlag(true),
})

export type StorageConfig = {
  endpoint: string | undefined
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle: boolean
}

/**
 * Where uploaded files go, or `null` when the server has no storage: photos are then off and
 * everything else runs as before. A half-filled set is a mistake worth stopping for, not a quiet
 * "off", so naming some of bucket and keys without the rest refuses to start.
 */
export function storageConfig(env: Record<string, string | undefined>): StorageConfig | null {
  const parsed = raw.parse(env)
  const bucket = parsed.S3_BUCKET || undefined
  const accessKeyId = parsed.S3_ACCESS_KEY_ID || undefined
  const secretAccessKey = parsed.S3_SECRET_ACCESS_KEY || undefined
  const missing = Object.entries({
    S3_BUCKET: bucket,
    S3_ACCESS_KEY_ID: accessKeyId,
    S3_SECRET_ACCESS_KEY: secretAccessKey,
  }).flatMap(([name, value]) => (value === undefined ? [name] : []))
  if (missing.length === 3) return null
  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      `File storage is half set up: ${missing.join(', ')} missing. Set all of S3_BUCKET, ` +
        'S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or none of them to run without photos.',
    )
  }
  // `storage:3900` parses as a URL with a `storage:` scheme, so the scheme is what gets checked.
  if (parsed.S3_ENDPOINT && !/^https?:$/.test(URL.parse(parsed.S3_ENDPOINT)?.protocol ?? '')) {
    throw new Error(`S3_ENDPOINT must be an http(s) URL, such as http://storage:3900`)
  }
  return {
    endpoint: parsed.S3_ENDPOINT || undefined,
    region: parsed.S3_REGION || 'us-east-1',
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: parsed.S3_FORCE_PATH_STYLE,
  }
}
