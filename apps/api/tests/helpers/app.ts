import { buildApp } from '../../src/app'
import { apiModules, type ModuleDeps } from '../../src/modules'
import { parseEnv, type Env } from '../../src/platform/config'
import type { EnvSource } from '../../src/shell/module'
import { withDatabase } from './db'

export async function withApp(
  overrides: Partial<Env> = {},
  deps: ModuleDeps & { clock?: () => Date; moduleEnv?: EnvSource } = {},
) {
  const { clock, moduleEnv = {}, ...moduleDeps } = deps
  const database = await withDatabase()
  const env: Env = {
    ...parseEnv({
      DATABASE_URL: database.connectionString,
      AUTH_REGISTRATION: 'open',
    }),
    ...overrides,
  }
  const modules = apiModules(moduleEnv, moduleDeps)
  const app = await buildApp({ env, db: database.db, modules, ...(clock ? { clock } : {}) })
  await app.ready()
  return {
    app,
    db: database.db,
    env,
    modules,
    stop: async () => {
      await app.close()
      await database.stop()
    },
  }
}
