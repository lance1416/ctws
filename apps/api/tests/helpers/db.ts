import { randomBytes } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Client } from 'pg'
import { inject } from 'vitest'
import { closeDb, createDb } from '../../src/db/client'
import { databaseUrl } from './database-url'

const MIGRATIONS = join(import.meta.dirname, '../../drizzle')

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
  const connectionString = await createDatabase(inject('templateDatabase'))
  const db = createDb(connectionString)
  return {
    connectionString,
    db,
    stop: async () => {
      await closeDb(db)
    },
  }
}

/**
 * A database migrated only up to and including `tag`, for testing what a migration does to rows
 * written under the schema before it -- the case a fresh database never meets, because it has no
 * rows when the migration runs. `migrateRest` then applies everything after `tag`, which is what a
 * database that was already deployed goes through on the next release.
 *
 * Built from `template0`, not the migrated template: it has to start from nothing.
 */
export async function migratedTo(tag: string) {
  const journal = JSON.parse(readFileSync(join(MIGRATIONS, 'meta/_journal.json'), 'utf8')) as {
    entries: { tag: string }[]
  }
  const last = journal.entries.findIndex((e) => e.tag === tag)
  if (last < 0) throw new Error(`no migration is tagged ${tag}`)
  const kept = journal.entries.slice(0, last + 1)
  const partial = mkdtempSync(join(tmpdir(), 'ctws-migrations-'))
  mkdirSync(join(partial, 'meta'))
  writeFileSync(join(partial, 'meta/_journal.json'), JSON.stringify({ ...journal, entries: kept }))
  for (const e of kept) cpSync(join(MIGRATIONS, `${e.tag}.sql`), join(partial, `${e.tag}.sql`))

  const connectionString = await createDatabase('template0')
  const db = createDb(connectionString)
  await migrate(db, { migrationsFolder: partial })
  return {
    connectionString,
    db,
    migrateRest: () => migrate(db, { migrationsFolder: MIGRATIONS }),
    stop: async () => {
      await closeDb(db)
      rmSync(partial, { recursive: true, force: true })
    },
  }
}

/** A new, uniquely named database copied from `template`; returns its connection string. */
async function createDatabase(template: string): Promise<string> {
  const adminConnectionString = inject('adminConnectionString')
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
  return databaseUrl(adminConnectionString, name)
}
