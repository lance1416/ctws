import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createSession, findValidSession, hashMatches, revokeSession } from '../src/auth/session'
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

/** What the database holds for a token, read raw. */
async function storedFor(token: string): Promise<{ id: string; token_hash: string } | undefined> {
  const rows = await ctx.db.execute(sql`select id, token_hash from sessions`)
  return (rows.rows as { id: string; token_hash: string }[]).find((r) =>
    hashMatches(token, r.token_hash),
  )
}

describe('session', () => {
  it('creates a session that resolves to its user', async () => {
    const session = await createSession(ctx.db, userId, 30)
    expect(await findValidSession(ctx.db, session.token)).toEqual({ userId })
  })

  /**
   * THE WHOLE POINT OF D2. Anything that can read this table used to hold a working session: the
   * token was the primary key, stored verbatim. Reading rows now gives a digest, which is not a
   * credential -- the difference between seeing someone's tasks and being able to act as them.
   */
  it('stores no copy of the token anywhere in the row', async () => {
    const session = await createSession(ctx.db, userId, 30)
    const rows = await ctx.db.execute(sql`select * from sessions`)
    const row = (rows.rows as Record<string, unknown>[]).find((r) =>
      hashMatches(session.token, String(r.token_hash)),
    )
    expect(row, 'the session was written').toBeDefined()
    for (const [column, value] of Object.entries(row!)) {
      expect(String(value), `${column} holds the token`).not.toContain(session.token)
    }
    // And the stored value is the digest, which is 64 hex characters whatever the token was.
    expect(String(row!.token_hash)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('does not let the stored value be used as the cookie', async () => {
    // The obvious attack after hashing: present the hash. It is not the token, so it hashes to
    // something else and matches nothing.
    const session = await createSession(ctx.db, userId, 30)
    const stored = await storedFor(session.token)
    expect(await findValidSession(ctx.db, stored!.token_hash)).toBeNull()
    // Nor is the internal row id a credential.
    expect(await findValidSession(ctx.db, stored!.id)).toBeNull()
  })

  it('returns null for an unknown token', async () => {
    expect(await findValidSession(ctx.db, 'not-a-session-at-all')).toBeNull()
  })

  it('rejects an expired session', async () => {
    const session = await createSession(ctx.db, userId, 30)
    const stored = await storedFor(session.token)
    await ctx.db.execute(sql`
      update sessions set expires_at = now() - interval '1 second' where id = ${stored!.id}
    `)
    expect(await findValidSession(ctx.db, session.token)).toBeNull()
  })

  it('rejects a revoked session', async () => {
    const session = await createSession(ctx.db, userId, 30)
    await revokeSession(ctx.db, session.token)
    expect(await findValidSession(ctx.db, session.token)).toBeNull()
  })

  it('tolerates revoking a session that does not exist', async () => {
    await expect(revokeSession(ctx.db, 'nothing-like-a-token')).resolves.toBeUndefined()
  })

  it('sets expiry from the ttl it is given', async () => {
    const before = Date.now()
    const session = await createSession(ctx.db, userId, 7)
    const days = (session.expiresAt.getTime() - before) / 86_400_000
    expect(days).toBeGreaterThan(6.9)
    expect(days).toBeLessThan(7.1)
  })

  it('mints a token with no structure to reason from', async () => {
    const a = await createSession(ctx.db, userId, 30)
    const b = await createSession(ctx.db, userId, 30)

    // 32 bytes, base64url: no dashes, no version nibble, nothing a uuid would carry. The old
    // token was a uuid v4 -- chosen over v7 so the id would not embed a creation timestamp;
    // this is that decision carried further, to 256 bits with no structure at all.
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a.token).not.toBe(b.token)
    // Two tokens minted back to back share no meaningful prefix, the way time-ordered ids do.
    const common = [...a.token].findIndex((ch, i) => ch !== b.token[i])
    expect(common).toBeLessThan(8)
  })

  /**
   * These used to be a GUARD: an attacker-controlled cookie reaching Postgres as a `uuid`
   * parameter raises 22P02 rather than matching no rows, so the old code refused a non-uuid
   * before querying. Hashing removed the guard and the problem with it -- every value is 64 hex
   * characters by the time it reaches the database -- and these stay to pin that.
   */
  describe('cookie values that are not tokens', () => {
    const bad = ['not-a-uuid', '', "' OR 1=1 --", '\u0000', 'ü'.repeat(500)]

    for (const value of bad) {
      it(`findValidSession returns null for ${JSON.stringify(value.slice(0, 20))}`, async () => {
        expect(await findValidSession(ctx.db, value)).toBeNull()
      })

      it(`revokeSession resolves for ${JSON.stringify(value.slice(0, 20))}`, async () => {
        await expect(revokeSession(ctx.db, value)).resolves.toBeUndefined()
      })
    }
  })
})
