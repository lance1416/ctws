import { buildApp } from './app'
import { createDb } from './db/client'
import { parseEnv } from './env'

const env = parseEnv(process.env)
const db = createDb(env.databaseUrl)
const app = await buildApp({ env, db })

await app.listen({ port: env.port, host: '0.0.0.0' })
