import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withDatabase } from './helpers/db'

let ctx: Awaited<ReturnType<typeof withDatabase>>

beforeAll(async () => {
  ctx = await withDatabase()
}, 120_000)

afterAll(async () => {
  await ctx?.stop()
})

async function columns(table: string) {
  const rows = await ctx.db.execute(sql`
    select column_name, is_nullable, data_type
    from information_schema.columns
    where table_name = ${table}
    order by column_name
  `)
  return rows.rows as { column_name: string; is_nullable: string; data_type: string }[]
}

describe('migrations', () => {
  it('creates the four M1 tables', async () => {
    const rows = await ctx.db.execute(sql`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
    `)
    const names = (rows.rows as { table_name: string }[]).map((r) => r.table_name)
    expect(names).toEqual(
      expect.arrayContaining(['users', 'sessions', 'workspaces', 'workspace_members']),
    )
  })

  it('requires the columns auth depends on', async () => {
    const names = (await columns('users')).map((c) => c.column_name)
    expect(names).toEqual(
      expect.arrayContaining([
        'id',
        'email',
        'password_hash',
        'timezone',
        'created_at',
        'role',
        'disabled_at',
      ]),
    )
  })

  it('defaults users.role to member and leaves disabled_at nullable', async () => {
    const cols = await columns('users')
    expect(cols.find((c) => c.column_name === 'role')!.is_nullable).toBe('NO')
    expect(cols.find((c) => c.column_name === 'disabled_at')!.is_nullable).toBe('YES')
    expect(cols.find((c) => c.column_name === 'disabled_at')!.data_type).toBe(
      'timestamp with time zone',
    )
    const [row] = (
      await ctx.db.execute(sql`
        insert into users (id, email, password_hash, timezone)
        values (gen_random_uuid(), 'default-role@example.com', 'x', 'UTC') returning role`)
    ).rows as { role: string }[]
    expect(row!.role).toBe('member')
  })

  it('restricts users.role to admin, maintainer and member', async () => {
    await expect(
      ctx.db.execute(sql`
        insert into users (id, email, password_hash, timezone, role)
        values (gen_random_uuid(), 'bad-role@example.com', 'x', 'UTC', 'root')`),
    ).rejects.toMatchObject({ cause: { constraint: 'users_role_check' } })
  })

  it('restricts workspace_members.role to owner and member', async () => {
    const [u] = (
      await ctx.db.execute(sql`
        insert into users (id, email, password_hash, timezone)
        values (gen_random_uuid(), 'wm@example.com', 'x', 'UTC') returning id`)
    ).rows as { id: string }[]
    const [w] = (
      await ctx.db.execute(sql`
        insert into workspaces (id, name) values (gen_random_uuid(), 'w') returning id`)
    ).rows as { id: string }[]
    await expect(
      ctx.db.execute(sql`
        insert into workspace_members (workspace_id, user_id, role)
        values (${w!.id}, ${u!.id}, 'admin')`),
    ).rejects.toMatchObject({ cause: { constraint: 'workspace_members_role_check' } })
  })

  // timestamptz is a project-wide constraint (M3 timezone correctness depends on it).
  it('stores every timestamp column as timestamptz and non-null', async () => {
    const expected = {
      users: ['created_at'],
      sessions: ['expires_at', 'created_at', 'last_seen_at'],
      workspaces: ['created_at'],
      workspace_members: ['joined_at'],
    }
    for (const [table, names] of Object.entries(expected)) {
      const cols = await columns(table)
      for (const name of names) {
        const col = cols.find((c) => c.column_name === name)
        expect(col, `${table}.${name} exists`).toBeDefined()
        expect(col!.data_type, `${table}.${name}`).toBe('timestamp with time zone')
        expect(col!.is_nullable, `${table}.${name}`).toBe('NO')
      }
    }
  })

  it('enforces unique emails', async () => {
    await ctx.db.execute(sql`
      insert into users (id, email, password_hash, timezone, created_at)
      values (gen_random_uuid(), 'dup@example.com', 'x', 'UTC', now())
    `)
    await expect(
      ctx.db.execute(sql`
        insert into users (id, email, password_hash, timezone, created_at)
        values (gen_random_uuid(), 'dup@example.com', 'x', 'UTC', now())
      `),
    ).rejects.toThrow()
  })

  it('cascades session deletion when its user is removed', async () => {
    const [user] = (
      await ctx.db.execute(sql`
        insert into users (id, email, password_hash, timezone, created_at)
        values (gen_random_uuid(), 'cascade@example.com', 'x', 'UTC', now())
        returning id
      `)
    ).rows as { id: string }[]

    await ctx.db.execute(sql`
      insert into sessions (id, user_id, expires_at, created_at, last_seen_at)
      values (gen_random_uuid(), ${user!.id}, now() + interval '1 day', now(), now())
    `)
    await ctx.db.execute(sql`delete from users where id = ${user!.id}`)

    const left = await ctx.db.execute(sql`select 1 from sessions where user_id = ${user!.id}`)
    expect(left.rows).toHaveLength(0)
  })
})
