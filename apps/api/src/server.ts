import { buildApp } from './app'
import { apiModules } from './modules'
import { createDb } from './platform/db/client'
import { parseEnv } from './platform/config'
import { s3Store, storageConfig } from './platform/storage'
import { readingConfig } from './modules/reading/config'
import { outsidePreviewer } from './shell/resources'
import { parseFailAt, runRedesignMigration } from './shell/migration'

const env = parseEnv(process.env)
const db = createDb(env.databaseUrl)
// Only read here, never connected to: a store that is down must not keep the api from starting.
const storage = storageConfig(process.env)
// Each module reads its own settings, so a bad one stops the server here too.
const app = await buildApp({
  env,
  db,
  modules: apiModules(process.env),
  storage: storage ? s3Store(storage) : null,
  // Link cards are fetched under the same switch as a reading link's title.
  previews: readingConfig(process.env).unfurl ? outsidePreviewer() : null,
})

// The move to the new layout runs once per workspace, after the schema migrations (the image's
// command) and before anyone is served: a workspace still in the old layout is never served, and
// without a backup to go back to it is not moved either, so the server stops here.
await runRedesignMigration(db, {
  backupsDir: env.backupsDir,
  failAt: parseFailAt(env.migrationFailAt),
  now: app.clock(),
})

await app.listen({ port: env.port, host: '0.0.0.0' })
