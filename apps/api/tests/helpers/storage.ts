import { randomBytes } from 'node:crypto'
import { GenericContainer, Wait } from 'testcontainers'
import type { StorageConfig } from '../../src/platform/storage'

// The same store the compose files run, so a test passes against what production talks to.
// Keep the tag and the file in step with docker-compose.yml and compose.prod.yaml.
const GARAGE = 'dxflrs/garage:v2.5.0'
const GARAGE_TOML = `
metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
db_engine = "sqlite"
replication_factor = 1
rpc_bind_addr = "[::]:3901"
rpc_public_addr = "127.0.0.1:3901"

[s3_api]
s3_region = "us-east-1"
api_bind_addr = "[::]:3900"
`

/**
 * A Garage of its own for one test file, with a bucket and a key already made, and the settings
 * that reach it from here. Its image has no shell, so readiness is read from its log: the bucket
 * line comes after the key is made and before the S3 port is opened, which follows at once.
 */
export async function withGarage() {
  const accessKeyId = `GK${randomBytes(12).toString('hex')}`
  const secretAccessKey = randomBytes(32).toString('hex')
  const bucket = 'ctws-test'
  const container = await new GenericContainer(GARAGE)
    .withCopyContentToContainer([{ content: GARAGE_TOML, target: '/etc/garage.toml' }])
    .withEnvironment({
      GARAGE_RPC_SECRET: randomBytes(32).toString('hex'),
      GARAGE_DEFAULT_ACCESS_KEY: accessKeyId,
      GARAGE_DEFAULT_SECRET_KEY: secretAccessKey,
      GARAGE_DEFAULT_BUCKET: bucket,
    })
    .withCommand(['/garage', 'server', '--single-node', '--default-bucket'])
    .withExposedPorts(3900)
    .withWaitStrategy(Wait.forLogMessage(/S3 API server listening/))
    .start()
  const config: StorageConfig = {
    endpoint: `http://${container.getHost()}:${container.getMappedPort(3900)}`,
    region: 'us-east-1',
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: true,
  }
  return { config, stop: () => container.stop() }
}
