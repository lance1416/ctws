import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Queryable } from '../src/platform/db/client'
import { withDatabase } from './helpers/db'

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

// The runtime assertions below cannot prove the type relation: vitest strips types, so they
// would still pass if `Queryable` were just `Db`. The guard is `pnpm typecheck` (tsc --noEmit
// covers tests/): the transaction call below must compile, and the @ts-expect-error line must
// NOT compile -- if `Queryable` became too wide or too narrow, tsc fails.
describe('Queryable', () => {
  it('rejects values that are neither a db nor a transaction (checked by tsc)', () => {
    // @ts-expect-error a plain object is not a Queryable
    const notQueryable: Queryable = { execute: () => Promise.resolve() }
    expect(notQueryable).toBeDefined()
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
