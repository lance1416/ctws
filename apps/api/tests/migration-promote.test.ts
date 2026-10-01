import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { closeDb, createDb } from '../src/db/client'
import { runMigrations } from '../src/db/migrate'

const drizzleDir = resolve(import.meta.dirname, '../drizzle')

// Builds a migrations folder holding only the first migration, i.e. the schema an instance
// deployed before roles existed would have.
function legacyMigrationsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ctws-legacy-'))
  mkdirSync(join(dir, 'meta'))
  const journal = JSON.parse(readFileSync(join(drizzleDir, 'meta/_journal.json'), 'utf8'))
  journal.entries = journal.entries.slice(0, 1)
  writeFileSync(join(dir, 'meta/_journal.json'), JSON.stringify(journal))
  cpSync(
    join(drizzleDir, journal.entries[0].tag + '.sql'),
    join(dir, journal.entries[0].tag + '.sql'),
  )
  return dir
}

describe('migration 0001 on an already-deployed database', () => {
  it('promotes the earliest existing user to admin and leaves the rest members', async () => {
    const container = await new PostgreSqlContainer('postgres:18-alpine').start()
    const url = container.getConnectionUri()
    const db = createDb(url)
    try {
      process.env.MIGRATIONS_DIR = legacyMigrationsDir()
      await runMigrations(url)
      delete process.env.MIGRATIONS_DIR

      await db.execute(sql`
        insert into users (id, email, password_hash, timezone, created_at) values
          (gen_random_uuid(), 'late@example.com', 'x', 'UTC', '2026-03-01T00:00:00Z'),
          (gen_random_uuid(), 'first@example.com', 'x', 'UTC', '2026-01-01T00:00:00Z'),
          (gen_random_uuid(), 'mid@example.com', 'x', 'UTC', '2026-02-01T00:00:00Z')`)

      await runMigrations(url)

      const rows = await db.execute(sql`select email, role from users order by created_at`)
      expect(rows.rows).toEqual([
        { email: 'first@example.com', role: 'admin' },
        { email: 'mid@example.com', role: 'member' },
        { email: 'late@example.com', role: 'member' },
      ])
    } finally {
      delete process.env.MIGRATIONS_DIR
      await closeDb(db)
      await container.stop()
    }
  })

  it('is a no-op on an empty users table', async () => {
    const container = await new PostgreSqlContainer('postgres:18-alpine').start()
    try {
      await runMigrations(container.getConnectionUri())
    } finally {
      await container.stop()
    }
  })
})
