import { buildApp } from '../../src/app'
import type { Unfurl } from '../../src/modules/reading/unfurl'
import { parseEnv, type Env } from '../../src/platform/config'
import { withDatabase } from './db'

export async function withApp(
  overrides: Partial<Env> = {},
  deps: { unfurl?: Unfurl; clock?: () => Date } = {},
) {
  const database = await withDatabase()
  const env: Env = {
    ...parseEnv({
      DATABASE_URL: database.connectionString,
      CORS_ORIGINS: 'http://localhost:5173',
      AUTH_REGISTRATION: 'open',
    }),
    ...overrides,
  }
  const app = await buildApp({ env, db: database.db, ...deps })
  await app.ready()
  return {
    app,
    db: database.db,
    env,
    stop: async () => {
      await app.close()
      await database.stop()
    },
  }
}
