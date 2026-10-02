import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { appWithUser, createProject } from './helpers/tasks'

// The backfill is read out of drizzle/0003_*.sql rather than copied here: a copy that drifts tests
// nothing, because the migration is what runs in production.
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../drizzle',
    readdirSync(resolve(__dirname, '../drizzle')).find((f) => /^0003_.*\.sql$/.test(f))!,
  ),
  'utf8',
)
const BACKFILL_STATEMENT = /^insert into projects[^;]*;/m.exec(migrationSql)?.[0]
if (!BACKFILL_STATEMENT) throw new Error('backfill statement not found in the 0003 migration')
const BACKFILL_SQL = sql.raw(BACKFILL_STATEMENT)

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function setup() {
  const ctx = await appWithUser()
  cleanups.push(ctx.stop)
  return ctx
}

async function projectsOf(ctx: Awaited<ReturnType<typeof setup>>) {
  const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/projects', headers: ctx.authed })
  return res.json().projects as { id: string; name: string; isInbox: boolean }[]
}

describe('inbox project', () => {
  it('is created by registration', async () => {
    const ctx = await setup()
    const inboxes = (await projectsOf(ctx)).filter((p) => p.isInbox)
    expect(inboxes).toHaveLength(1)
  })

  it('sorts ahead of every other project regardless of rank', async () => {
    const ctx = await setup()
    const low = await createProject(ctx, 'aaa')
    await createProject(ctx, 'zzz')
    // Fresh projects rank after the inbox, which would pass even with no inbox-first ordering.
    // Force one to rank bytewise below it ('A0' < 'a0' under COLLATE "C").
    await ctx.db.execute(sql`update projects set rank = 'A0' where id = ${low}`)
    const list = await projectsOf(ctx)
    expect(list[0]!.isInbox).toBe(true)
    expect(list.slice(1).every((p) => !p.isInbox)).toBe(true)
  })

  // The DB, not the app layer, guarantees "exactly one inbox per workspace".
  it('cannot have a second inbox in one workspace', async () => {
    const ctx = await setup()
    const rows = (
      await ctx.db.execute(sql`select workspace_id from projects where is_inbox limit 1`)
    ).rows as { workspace_id: string }[]
    const wsId = rows[0]!.workspace_id
    await expect(
      ctx.db.execute(sql`
        insert into projects (id, workspace_id, name, rank, is_inbox)
        values (gen_random_uuid(), ${wsId}, 'second inbox', 'zz', true)
      `),
    ).rejects.toThrow()
  })

  // Review Focus 1. The deployed instance's workspace predates this column; without the
  // migration's backfill its first quick capture 500s. The backfill statement must also be
  // idempotent, because a re-run must not create a second inbox.
  it('backfills a workspace that has no inbox, and is idempotent', async () => {
    const ctx = await setup()
    await ctx.db.execute(sql`delete from projects where is_inbox`)
    expect((await projectsOf(ctx)).filter((p) => p.isInbox)).toHaveLength(0)

    for (let i = 0; i < 2; i++) await ctx.db.execute(BACKFILL_SQL)

    const inboxes = (await projectsOf(ctx)).filter((p) => p.isInbox)
    expect(inboxes).toHaveLength(1)
    expect(inboxes[0]!.name).toBe('Inbox')
  })
})
