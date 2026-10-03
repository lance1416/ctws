import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import type { TestProject } from 'vitest/node'
import { runMigrations } from '../../src/db/migrate'
import { databaseUrl } from './database-url'

declare module 'vitest' {
  export interface ProvidedContext {
    /** Connection URI of the shared container's default database. Used only to run `CREATE DATABASE`. */
    adminConnectionString: string
    /** Name of the migrated database every per-test database is cloned from. Nothing may connect to it. */
    templateDatabase: string
  }
}

const TEMPLATE_DATABASE = 'tmpl'

/**
 * One Postgres container per run. The migration set runs once, against a template database, and each
 * test then clones that template (see `withDatabase`). The template is created from the admin
 * database, and its migration pool is closed before this function returns: `CREATE DATABASE ...
 * TEMPLATE` refuses to run while anything is connected to the template.
 */
export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer('postgres:18-alpine').start()
  try {
    const adminConnectionString = container.getConnectionUri()

    const admin = new Client({ connectionString: adminConnectionString })
    await admin.connect()
    try {
      await admin.query(`CREATE DATABASE "${TEMPLATE_DATABASE}"`)
    } finally {
      await admin.end()
    }

    // `runMigrations` opens and fully closes its own pool.
    await runMigrations(databaseUrl(adminConnectionString, TEMPLATE_DATABASE))

    project.provide('adminConnectionString', adminConnectionString)
    project.provide('templateDatabase', TEMPLATE_DATABASE)
  } catch (error) {
    await container.stop()
    throw error
  }
  return async () => {
    await container.stop()
  }
}
