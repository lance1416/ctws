import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createSession, findValidSession, hashMatches, revokeSession } from '../src/auth/session'

import { withDatabase } from './helpers/db'

/** The window a session lives in, and the one it is extended by when it is used. */
const TTL_DAYS = 30

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
    expect(await findValidSession(ctx.db, session.token, TTL_DAYS)).toEqual({ userId })
  })

  /**
   * THE WHOLE POINT OF THE HASH. Anything that can read this table used to hold a working session: the
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
    expect(await findValidSession(ctx.db, stored!.token_hash, TTL_DAYS)).toBeNull()
    // Nor is the internal row id a credential.
    expect(await findValidSession(ctx.db, stored!.id, TTL_DAYS)).toBeNull()
  })

  it('returns null for an unknown token', async () => {
    expect(await findValidSession(ctx.db, 'not-a-session-at-all', TTL_DAYS)).toBeNull()
  })

  it('rejects an expired session', async () => {
    const session = await createSession(ctx.db, userId, 30)
    const stored = await storedFor(session.token)
    await ctx.db.execute(sql`
      update sessions set expires_at = now() - interval '1 second' where id = ${stored!.id}
    `)
    expect(await findValidSession(ctx.db, session.token, TTL_DAYS)).toBeNull()
  })

  it('rejects a revoked session', async () => {
    const session = await createSession(ctx.db, userId, 30)
    await revokeSession(ctx.db, session.token)
    expect(await findValidSession(ctx.db, session.token, TTL_DAYS)).toBeNull()
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
   * NO SHAPE GUARD IS NEEDED, and these pin why. A column holding the raw token would need one:
   * an attacker-controlled cookie reaching Postgres as a `uuid` parameter raises 22P02 rather
   * than matching no rows. Hashing makes every value 64 hex characters before it reaches the
   * database, so none of these can be malformed by the time it is queried.
   */
  describe('cookie values that are not tokens', () => {
    const bad = ['not-a-uuid', '', "' OR 1=1 --", '\u0000', 'ü'.repeat(500)]

    for (const value of bad) {
      it(`findValidSession returns null for ${JSON.stringify(value.slice(0, 20))}`, async () => {
        expect(await findValidSession(ctx.db, value, TTL_DAYS)).toBeNull()
      })

      it(`revokeSession resolves for ${JSON.stringify(value.slice(0, 20))}`, async () => {
        await expect(revokeSession(ctx.db, value)).resolves.toBeUndefined()
      })
    }
  })
})

/**
 * A SESSION THAT IS USED STAYS ALIVE, and one that is not expires.
 *
 * The window is IDLE, not absolute: thirty days since the app was last used, not since the
 * login. An absolute window signs you out on day thirty with no explanation, and no test that
 * signs in and acts within the same second can tell the two apart -- hence the clock below.
 */
describe('sliding expiry', () => {
  const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000)

  /** A user of this block's own, so the shared one above keeps whatever sessions it had. */
  async function makeUser(email: string): Promise<string> {
    const rows = await ctx.db.execute(sql`
      insert into users (id, email, password_hash, timezone, created_at)
      values (gen_random_uuid(), ${email}, 'x', 'UTC', now())
      returning id::text as id`)
    return (rows.rows as { id: string }[])[0]!.id
  }

  beforeEach(async () => {
    await ctx.db.execute(sql`delete from sessions`)
  })

  it('winds the clock on when a session is used after a while', async () => {
    const userId = await makeUser(`u-${crypto.randomUUID()}@example.com`)
    const session = await createSession(ctx.db, userId, TTL_DAYS)
    // Two hours since it was last seen, which is past the write-back threshold.
    await ctx.db.execute(
      sql`update sessions set last_seen_at = ${hoursAgo(2).toISOString()},
          expires_at = ${new Date(Date.now() + 3_600_000).toISOString()}`,
    )

    expect(await findValidSession(ctx.db, session.token, TTL_DAYS)).toEqual({ userId })

    const after = await ctx.db.execute(sql`select expires_at, last_seen_at from sessions`)
    const row = after.rows[0] as { expires_at: string; last_seen_at: string }
    // A full window from NOW, not an hour from now.
    const left = new Date(row.expires_at).getTime() - Date.now()
    expect(left).toBeGreaterThan((TTL_DAYS - 1) * 86_400_000)
    expect(Date.now() - new Date(row.last_seen_at).getTime()).toBeLessThan(60_000)
  })

  it('does not write on every request, only once the last write has gone stale', async () => {
    const userId = await makeUser(`u-${crypto.randomUUID()}@example.com`)
    const session = await createSession(ctx.db, userId, TTL_DAYS)
    const before = await ctx.db.execute(sql`select last_seen_at from sessions`)

    await findValidSession(ctx.db, session.token, TTL_DAYS)

    const after = await ctx.db.execute(sql`select last_seen_at from sessions`)
    expect((after.rows[0] as { last_seen_at: string }).last_seen_at).toBe(
      (before.rows[0] as { last_seen_at: string }).last_seen_at,
    )
  })

  it('sweeps only this user own expired sessions when they sign in again', async () => {
    const userId = await makeUser(`u-${crypto.randomUUID()}@example.com`)
    const other = await makeUser(`o-${crypto.randomUUID()}@example.com`)
    // FOUR sessions, one of each kind, because the sweep has two conditions and a fixture with
    // only the obvious row passes whichever of them is dropped.
    const myStale = await createSession(ctx.db, userId, TTL_DAYS)
    const myLive = await createSession(ctx.db, userId, TTL_DAYS)
    const theirStale = await createSession(ctx.db, other, TTL_DAYS)
    const theirLive = await createSession(ctx.db, other, TTL_DAYS)
    const expire = async (token: string) => {
      const row = await storedFor(token)
      await ctx.db.execute(
        sql`update sessions set expires_at = ${hoursAgo(1).toISOString()}
            where token_hash = ${row!.token_hash}`,
      )
    }
    await expire(myStale.token)
    await expire(theirStale.token)

    await createSession(ctx.db, userId, TTL_DAYS)

    // Mine that was dead is gone. Mine that was alive stayed. Neither of theirs was touched --
    // not even the dead one, which is not this login's to tidy.
    expect(await findValidSession(ctx.db, myStale.token, TTL_DAYS)).toBeNull()
    expect(await findValidSession(ctx.db, myLive.token, TTL_DAYS)).toEqual({ userId })
    expect(await findValidSession(ctx.db, theirLive.token, TTL_DAYS)).toEqual({ userId: other })
    expect(await storedFor(theirStale.token)).toBeDefined()
  })
})
