import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { closeDb, createDb } from '../src/db/client'
import { runMigrations } from '../src/db/migrate'

const drizzleDir = resolve(import.meta.dirname, '../drizzle')

/**
 * Builds a migrations folder holding everything UP TO 0013 -- the schema of a database deployed
 * while every relationship still lived in a `project_id` column or a join table of its own.
 */
function beforeLinks(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ctws-0012-'))
  mkdirSync(join(dir, 'meta'))
  const journal = JSON.parse(readFileSync(join(drizzleDir, 'meta/_journal.json'), 'utf8')) as {
    entries: { tag: string }[]
  }
  const upTo = journal.entries.findIndex((e) => e.tag.startsWith('0013'))
  expect(upTo, 'migration 0013 is in the journal').toBeGreaterThan(0)
  journal.entries = journal.entries.slice(0, upTo)
  writeFileSync(join(dir, 'meta/_journal.json'), JSON.stringify(journal))
  for (const entry of journal.entries) {
    cpSync(join(drizzleDir, `${entry.tag}.sql`), join(dir, `${entry.tag}.sql`))
  }
  return dir
}

const W = '11111111-1111-4111-8111-111111111111'
const PROJECT = '22222222-2222-4222-8222-222222222222'
const CONTACT = '33333333-3333-4333-8333-333333333333'
const LONER = '44444444-4444-4444-8444-444444444444'
const READING = '55555555-5555-4555-8555-555555555555'
const LOOSE_READING = '66666666-6666-4666-8666-666666666666'
const MEETING = '77777777-7777-4777-8777-777777777777'

/**
 * MIGRATIONS 0013/0014 ON A DATABASE THAT ALREADY HAS THINGS IN IT.
 *
 * 0014 drops two tables and two columns. Everything those held is a relationship somebody entered
 * by hand, and a fresh database cannot show it being lost -- it has no rows to lose, so the whole
 * suite stays green whether the edges are carried across or not. This test is the only thing that
 * says they are.
 */
describe('migrations 0013/0014 on an already-deployed database', () => {
  it('carries every relationship into `links` before the old shapes are dropped', async () => {
    const container = await new PostgreSqlContainer('postgres:18-alpine').start()
    const url = container.getConnectionUri()
    const db = createDb(url)
    try {
      process.env.MIGRATIONS_DIR = beforeLinks()
      await runMigrations(url)
      delete process.env.MIGRATIONS_DIR

      await db.execute(sql`insert into workspaces (id, name) values (${W}, 'W')`)
      await db.execute(sql`
        insert into projects (id, workspace_id, name, rank, is_inbox)
        values (${PROJECT}, ${W}, '找工作', 'm', false)`)
      await db.execute(sql`
        insert into contacts (id, workspace_id, name) values
          (${CONTACT}, ${W}, '陈颖'),
          (${LONER}, ${W}, '老朋友')`)
      await db.execute(sql`
        insert into contact_projects (contact_id, project_id) values (${CONTACT}, ${PROJECT})`)
      await db.execute(sql`
        insert into reading_items (id, workspace_id, project_id, kind, status, title, url) values
          (${READING}, ${W}, ${PROJECT}, 'link', 'todo', '面试准备', 'https://e.test/a'),
          (${LOOSE_READING}, ${W}, null, 'link', 'todo', '随便读的', 'https://e.test/b')`)
      await db.execute(sql`
        insert into meetings
          (id, workspace_id, project_id, title, time_zone, starts_local, duration_minutes)
        values (${MEETING}, ${W}, ${PROJECT}, '二面', 'America/Toronto',
                '2026-10-20T21:00', 60)`)
      await db.execute(sql`
        insert into meeting_attendees (meeting_id, contact_id) values (${MEETING}, ${CONTACT})`)

      await runMigrations(url)

      const edges = await db.execute(sql`
        select from_type, from_id::text as from_id, to_type, to_id::text as to_id, kind,
               workspace_id::text as workspace_id
        from links order by kind, from_type`)
      expect(edges.rows).toEqual([
        // 会议 -> 参与人
        {
          workspace_id: W,
          from_type: 'meeting',
          from_id: MEETING,
          to_type: 'contact',
          to_id: CONTACT,
          kind: 'attends',
        },
        // 联系人 / 会议 / 待读 -> 项目
        {
          workspace_id: W,
          from_type: 'contact',
          from_id: CONTACT,
          to_type: 'project',
          to_id: PROJECT,
          kind: 'belongs',
        },
        {
          workspace_id: W,
          from_type: 'meeting',
          from_id: MEETING,
          to_type: 'project',
          to_id: PROJECT,
          kind: 'belongs',
        },
        {
          workspace_id: W,
          from_type: 'reading',
          from_id: READING,
          to_type: 'project',
          to_id: PROJECT,
          kind: 'belongs',
        },
      ])

      // Things that belonged to nothing get no edge, rather than one pointing at nothing.
      const stayed = await db.execute(sql`
        select (select count(*)::int from contacts) as contacts,
               (select count(*)::int from reading_items) as readings`)
      expect(stayed.rows[0]).toEqual({ contacts: 2, readings: 2 })

      // And the old shapes really are gone, so nothing can go on writing to them.
      const leftovers = await db.execute(sql`
        select table_name, column_name from information_schema.columns
        where (table_name = 'reading_items' and column_name = 'project_id')
           or (table_name = 'meetings' and column_name = 'project_id')
        union all
        select table_name, '' from information_schema.tables
        where table_name in ('contact_projects', 'meeting_attendees')`)
      expect(leftovers.rows).toEqual([])
    } finally {
      await closeDb(db)
      await container.stop()
    }
  }, 120_000)
})
