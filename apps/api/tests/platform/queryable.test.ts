import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest'
import type { Queryable, Tx } from '../../src/platform/db/client'
import { withDatabase } from '../helpers/db'

let ctx: Awaited<ReturnType<typeof withDatabase>>

beforeAll(async () => {
  ctx = await withDatabase()
}, 120_000)

afterAll(async () => {
  await ctx?.stop()
})

// A service-shaped function: it accepts either the pool-backed db or a transaction.
async function countUsers(q: Queryable): Promise<number> {
  const rows = await q.execute(sql`select count(*)::int as n from users`)
  return (rows.rows as { n: number }[])[0]!.n
}

describe('Queryable', () => {
  it('accepts the db and a transaction, and rejects anything else', () => {
    expectTypeOf<typeof ctx.db>().toExtend<Queryable>()
    expectTypeOf<Parameters<Parameters<typeof ctx.db.transaction>[0]>[0]>().toExtend<Queryable>()
    expectTypeOf<{ execute: () => Promise<void> }>().not.toExtend<Queryable>()
  })

  it('lets a lock or a set-replacing write refuse the pool', () => {
    expectTypeOf<Parameters<Parameters<typeof ctx.db.transaction>[0]>[0]>().toExtend<Tx>()
    expectTypeOf<typeof ctx.db>().not.toExtend<Tx>()
  })

  it('sees uncommitted rows when given the transaction, and discards them on rollback', async () => {
    const before = await countUsers(ctx.db)
    await expect(
      ctx.db.transaction(async (tx) => {
        await tx.execute(sql`
          insert into users (id, email, password_hash, timezone, role)
          values (gen_random_uuid(), 'q@example.com', 'x', 'UTC', 'member')
        `)
        expect(await countUsers(tx)).toBe(before + 1)
        throw new Error('rollback')
      }),
    ).rejects.toThrow('rollback')
    expect(await countUsers(ctx.db)).toBe(before)
  })
})
