import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { closeDb, createDb } from '../src/db/client'
import { runMigrations } from '../src/db/migrate'

const drizzleDir = resolve(import.meta.dirname, '../drizzle')

/** Builds a migrations folder holding everything BEFORE the migration tagged `stop`. */
function upTo(stop: string): string {
  const dir = mkdtempSync(join(tmpdir(), `ctws-before-${stop}-`))
  mkdirSync(join(dir, 'meta'))
  const journal = JSON.parse(readFileSync(join(drizzleDir, 'meta/_journal.json'), 'utf8')) as {
    entries: { tag: string }[]
  }
  const cut = journal.entries.findIndex((e) => e.tag.startsWith(stop))
  expect(cut, `migration ${stop} is in the journal`).toBeGreaterThan(0)
  journal.entries = journal.entries.slice(0, cut)
  writeFileSync(join(dir, 'meta/_journal.json'), JSON.stringify(journal))
  for (const entry of journal.entries) {
    cpSync(join(drizzleDir, `${entry.tag}.sql`), join(dir, `${entry.tag}.sql`))
  }
  return dir
}

/**
 * MIGRATION 0011 ON A DATABASE THAT ALREADY HAS PEOPLE IN IT.
 *
 * `drizzle-kit` generated this one as "create the table, drop the column" -- which loses every
 * person's project without a word. A fresh database cannot show that: it has no rows to lose, so
 * the whole suite stays green either way. This test is the only thing standing between a correct
 * migration and a silent one.
 */
describe('migration 0011 on an already-deployed database', () => {
  it('carries each contact project into the association table before dropping the column', async () => {
    const container = await new PostgreSqlContainer('postgres:18-alpine').start()
    const url = container.getConnectionUri()
    const db = createDb(url)
    try {
      process.env.MIGRATIONS_DIR = upTo('0011')
      await runMigrations(url)

      await db.execute(sql`
        insert into workspaces (id, name) values
          ('11111111-1111-4111-8111-111111111111', 'W')`)
      await db.execute(sql`
        insert into projects (id, workspace_id, name, rank, is_inbox) values
          ('22222222-2222-4222-8222-222222222222',
           '11111111-1111-4111-8111-111111111111', '找工作', 'm', false)`)
      await db.execute(sql`
        insert into contacts (id, workspace_id, project_id, name) values
          ('33333333-3333-4333-8333-333333333333',
           '11111111-1111-4111-8111-111111111111',
           '22222222-2222-4222-8222-222222222222', '某招聘'),
          ('44444444-4444-4444-8444-444444444444',
           '11111111-1111-4111-8111-111111111111', null, '老朋友')`)

      // Stop at 0011: 0014 moves these rows into `links` and drops the table, and that move has
      // a test of its own. This one is about 0011 alone.
      process.env.MIGRATIONS_DIR = upTo('0012')
      await runMigrations(url)
      delete process.env.MIGRATIONS_DIR

      const links = await db.execute(sql`
        select contact_id::text as contact_id, project_id::text as project_id
        from contact_projects order by contact_id`)
      expect(links.rows).toEqual([
        {
          contact_id: '33333333-3333-4333-8333-333333333333',
          project_id: '22222222-2222-4222-8222-222222222222',
        },
      ])
      // The person who had none gets no link, rather than a row pointing at nothing.
      const everyone = await db.execute(sql`select count(*)::int as n from contacts`)
      expect((everyone.rows[0] as { n: number }).n).toBe(2)
      // And the old column really is gone, so nothing can go on writing to it.
      const column = await db.execute(sql`
        select 1 from information_schema.columns
        where table_name = 'contacts' and column_name = 'project_id'`)
      expect(column.rows).toEqual([])
    } finally {
      await closeDb(db)
      await container.stop()
    }
  }, 120_000)
})
