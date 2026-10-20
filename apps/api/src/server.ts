import { buildApp } from './app'
import { apiModules } from './modules'
import { createDb } from './platform/db/client'
import { parseEnv } from './platform/config'
import { parseFailAt, runRedesignMigration } from './shell/migration'

const env = parseEnv(process.env)
const db = createDb(env.databaseUrl)
// Each module reads its own settings, so a bad one stops the server here too.
const app = await buildApp({ env, db, modules: apiModules(process.env) })

// The move to the new layout runs once per workspace, after the schema migrations (the image's
// command) and before anyone is served. Without a backups directory nothing is attempted.
if (env.backupsDir) {
  await runRedesignMigration(db, {
    backupsDir: env.backupsDir,
    failAt: parseFailAt(env.migrationFailAt),
    now: app.clock(),
  })
}

await app.listen({ port: env.port, host: '0.0.0.0' })
