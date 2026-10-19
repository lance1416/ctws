import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import type { Db } from '../../src/platform/db/client'

const FIXTURES = join(import.meta.dirname, '../fixtures')

/**
 * Loads a data-only SQL dump (`pg_dump --data-only --inserts`) into a database that already has
 * the schema the dump was taken from. The dump's own SET lines are harmless; psql meta-commands
 * (`\restrict`) were stripped when the file was made, since this runs through a client, not psql.
 */
export async function loadFixture(db: Db, name: string): Promise<void> {
  const text = readFileSync(join(FIXTURES, `${name}.sql`), 'utf8')
    .split('\n')
    // The dump clears search_path for its session; the inserts are schema-qualified anyway, and a
    // pooled connection that kept the empty path would fail every plain query after it.
    .filter((line) => !line.startsWith("SELECT pg_catalog.set_config('search_path'"))
    .join('\n')
  await db.execute(sql.raw(text))
}

/** The rows of a table, counted. */
export async function countOf(db: Db, table: string): Promise<number> {
  const result = await db.execute(sql.raw(`select count(*)::int as n from ${table}`))
  return (result.rows[0] as { n: number }).n
}
