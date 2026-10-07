import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { closeDb, createDb } from '../src/db/client'
import { runMigrations } from '../src/db/migrate'

const drizzleDir = resolve(import.meta.dirname, '../drizzle')

/** A migrations folder holding everything up to, but not including, `tag`. */
function migrationsBefore(tag: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'ctws-before-'))
  mkdirSync(join(dir, 'meta'))
  const journal = JSON.parse(readFileSync(join(drizzleDir, 'meta/_journal.json'), 'utf8'))
  const at = journal.entries.findIndex((e: { tag: string }) => e.tag === tag)
  expect(at, `${tag} must be in the journal`).toBeGreaterThan(0)
  journal.entries = journal.entries.slice(0, at)
  writeFileSync(join(dir, 'meta/_journal.json'), JSON.stringify(journal))
  for (const e of journal.entries as { tag: string }[]) {
    cpSync(join(drizzleDir, `${e.tag}.sql`), join(dir, `${e.tag}.sql`))
  }
  return dir
}

/**
 * 0005 MOVES THE TASKS THAT WERE NEVER DECIDED, AND ONLY THOSE.
 *
 * New tasks defaulted to `backlog` until 2026-10-07, and `backlog` is excluded from the rollup
 * before its children are even looked at -- so the whole tree reported no progress. The default
 * is `todo` now, and the rows already in the database have to be told apart: one that a person
 * deliberately filed as `backlog` must stay there.
 *
 * The event log is what tells them apart, which is the first time it has paid for itself outside
 * the review view.
 */
describe('migration 0005 on an already-deployed database', () => {
  it('commits the untouched backlog rows and leaves the deliberate ones alone', async () => {
    const container = await new PostgreSqlContainer('postgres:18-alpine').start()
    const url = container.getConnectionUri()
    const db = createDb(url)
    try {
      process.env.MIGRATIONS_DIR = migrationsBefore('0005_commit_the_backlog')
      await runMigrations(url)
      delete process.env.MIGRATIONS_DIR

      await db.execute(sql`
        insert into users (id, email, password_hash, timezone)
          values ('00000000-0000-4000-8000-000000000001', 'u@example.com', 'x', 'UTC');
      `)
      await db.execute(sql`
        insert into workspaces (id, name) values ('00000000-0000-4000-8000-000000000002', 'W');
      `)
      await db.execute(sql`
        insert into projects (id, workspace_id, name, rank)
          values ('00000000-0000-4000-8000-000000000003',
                  '00000000-0000-4000-8000-000000000002', 'P', 'a0');
      `)
      // Three rows, all sitting on backlog, with three different histories behind them.
      await db.execute(sql`
        insert into tasks (id, project_id, title, status, rank) values
          ('00000000-0000-4000-8000-000000000010',
           '00000000-0000-4000-8000-000000000003', 'never touched', 'backlog', 'a0'),
          ('00000000-0000-4000-8000-000000000011',
           '00000000-0000-4000-8000-000000000003', 'filed on purpose', 'backlog', 'a1'),
          ('00000000-0000-4000-8000-000000000012',
           '00000000-0000-4000-8000-000000000003', 'touched, but not into backlog', 'backlog', 'a2'),
          ('00000000-0000-4000-8000-000000000013',
           '00000000-0000-4000-8000-000000000003', 'already doing it', 'in_progress', 'a3');
      `)
      await db.execute(sql`
        insert into task_events (id, task_id, workspace_id, actor_user_id, type, payload, occurred_at)
        values
          -- Somebody moved this one INTO backlog: a decision, and it stands.
          (gen_random_uuid(), '00000000-0000-4000-8000-000000000011',
           '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001',
           'status_changed', '{"from":"todo","to":"backlog"}'::jsonb, now()),
          -- This one has a history, but it is about leaving backlog, not entering it.
          (gen_random_uuid(), '00000000-0000-4000-8000-000000000012',
           '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001',
           'status_changed', '{"from":"backlog","to":"todo"}'::jsonb, now()),
          -- And a non-status event must not look like one.
          (gen_random_uuid(), '00000000-0000-4000-8000-000000000010',
           '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001',
           'title_changed', '{"from":"a","to":"backlog"}'::jsonb, now());
      `)

      await runMigrations(url)

      const rows = await db.execute(sql`select title, status from tasks order by rank`)
      expect(rows.rows).toEqual([
        { title: 'never touched', status: 'todo' },
        { title: 'filed on purpose', status: 'backlog' },
        { title: 'touched, but not into backlog', status: 'todo' },
        { title: 'already doing it', status: 'in_progress' },
      ])
    } finally {
      await closeDb(db)
      await container.stop()
    }
  }, 120_000)
})
