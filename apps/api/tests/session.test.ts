import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createSession, findValidSession, revokeSession } from '../src/auth/session'
import { withDatabase } from './helpers/db'

let ctx: Awaited<ReturnType<typeof withDatabase>>
let userId: string

beforeAll(async () => {
  ctx = await withDatabase()
  const rows = await ctx.db.execute(sql`
    insert into users (id, email, password_hash, timezone, created_at)
    values (gen_random_uuid(), 's@example.com', 'x', 'UTC', now())
    returning id
  `)
  userId = (rows.rows as { id: string }[])[0]!.id
}, 120_000)

afterAll(async () => {
  await ctx?.stop()
})

describe('session', () => {
  it('creates a session that resolves to its user', async () => {
    const session = await createSession(ctx.db, userId, 30)
    expect(await findValidSession(ctx.db, session.id)).toEqual({ userId })
  })

  it('returns null for an unknown session id', async () => {
    expect(await findValidSession(ctx.db, '00000000-0000-0000-0000-000000000000')).toBeNull()
  })

  // Review Focus #4 —— 过期 session 必须被拒
  it('rejects an expired session', async () => {
    const session = await createSession(ctx.db, userId, 30)
    await ctx.db.execute(sql`
      update sessions set expires_at = now() - interval '1 second' where id = ${session.id}
    `)
    expect(await findValidSession(ctx.db, session.id)).toBeNull()
  })

  // Review Focus #4 —— 吊销后必须立即失效
  it('rejects a revoked session', async () => {
    const session = await createSession(ctx.db, userId, 30)
    await revokeSession(ctx.db, session.id)
    expect(await findValidSession(ctx.db, session.id)).toBeNull()
  })

  it('tolerates revoking a session that does not exist', async () => {
    await expect(
      revokeSession(ctx.db, '00000000-0000-0000-0000-000000000000'),
    ).resolves.toBeUndefined()
  })

  it('sets expiry from the ttl it is given', async () => {
    const before = Date.now()
    const session = await createSession(ctx.db, userId, 7)
    const days = (session.expiresAt.getTime() - before) / 86_400_000
    expect(days).toBeGreaterThan(6.9)
    expect(days).toBeLessThan(7.1)
  })

  // Cross-task dependency for Task 7: malformed/attacker-controlled session ids
  // must never reach the database as a raw UUID query parameter.
  describe('malformed session ids', () => {
    const badIds = ['not-a-uuid', '', "' OR 1=1 --"]

    for (const badId of badIds) {
      it(`findValidSession returns null for ${JSON.stringify(badId)}`, async () => {
        expect(await findValidSession(ctx.db, badId)).toBeNull()
      })

      it(`revokeSession resolves without throwing for ${JSON.stringify(badId)}`, async () => {
        await expect(revokeSession(ctx.db, badId)).resolves.toBeUndefined()
      })
    }
  })
})
