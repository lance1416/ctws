import { randomBytes } from 'node:crypto'
import { Client } from 'pg'
import { inject } from 'vitest'
import { closeDb, createDb } from '../../src/db/client'
import { databaseUrl } from './database-url'

// Fixed key for the session-level advisory lock that serialises clones. `CREATE DATABASE` briefly
// connects to the template, so two concurrent clones can fail with "source database is being
// accessed by other users"; holding this lock makes that impossible rather than unlikely.
const CLONE_LOCK_KEY = 7_315_001

/**
 * A fresh, fully migrated database for one test: a clone of the template that `global-setup.ts`
 * migrated once. The returned `connectionString` points at the clone, so `parseEnv` and friends see
 * an isolated database exactly as they did when each test had its own container.
 *
 * `stop` closes the pool only. The container is ephemeral and torn down at the end of the run, so
 * dropping the clone would add a failure mode (a lingering connection) for no benefit.
 */
export async function withDatabase() {
  const adminConnectionString = inject('adminConnectionString')
  const template = inject('templateDatabase')
  const name = `t_${randomBytes(8).toString('hex')}`

  const admin = new Client({ connectionString: adminConnectionString })
  await admin.connect()
  try {
    await admin.query('SELECT pg_advisory_lock($1)', [CLONE_LOCK_KEY])
    try {
      await admin.query(`CREATE DATABASE "${name}" TEMPLATE "${template}"`)
    } finally {
      await admin.query('SELECT pg_advisory_unlock($1)', [CLONE_LOCK_KEY])
    }
  } finally {
    await admin.end()
  }

  const connectionString = databaseUrl(adminConnectionString, name)
  const db = createDb(connectionString)
  return {
    connectionString,
    db,
    stop: async () => {
      await closeDb(db)
    },
  }
}
