import { buildApp } from './app'
import { apiModules } from './modules'
import { createDb } from './platform/db/client'
import { parseEnv } from './platform/config'

const env = parseEnv(process.env)
const db = createDb(env.databaseUrl)
// Each module reads its own settings, so a bad one stops the server here too.
const app = await buildApp({ env, db, modules: apiModules(process.env) })

await app.listen({ port: env.port, host: '0.0.0.0' })
