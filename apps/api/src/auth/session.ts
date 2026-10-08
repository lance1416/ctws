import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import type { Queryable } from '../db/client'
import { sessions } from '../db/schema'

/**
 * SESSIONS. The cookie carries a token; the database holds only its SHA-256 (D2).
 *
 * WHAT THAT CHANGES. The token used to BE the primary key, stored verbatim, so anything that
 * could read the table had a working session -- not a thing to crack, a thing to paste into a
 * cookie jar and be you. "The data is leaked anyway" conflates two different losses: reading
 * rows shows someone your tasks, holding a token lets them ACT as you, and keeps them signed in
 * until it expires. The leak surface is not only a breached database either -- it is a backup,
 * a `pg_dump`, a `select * from sessions` pasted into a chat to debug something.
 *
 * SHA-256 AND NOT ARGON2, on purpose. A password is low-entropy and needs a slow hash to survive
 * being guessed. A session token is 32 bytes from the CSPRNG: there is nothing to guess, so the
 * only job here is to make the stored value useless on its own, and a fast digest does that. A
 * slow hash would also put argon2 on the hot path of every authenticated request.
 */

/** 32 bytes of CSPRNG, base64url. Not a uuid: see the note in `createSession`. */
function newToken(): string {
  return randomBytes(32).toString('base64url')
}

const digest = (token: string): string => createHash('sha256').update(token).digest('hex')

export async function createSession(
  db: Queryable,
  userId: string,
  ttlDays: number,
): Promise<{ token: string; expiresAt: Date }> {
  /**
   * The token is opaque bearer credential material (design spec §10.1), not an entity. It used
   * to be a uuid v4 -- chosen over v7 precisely because v7 embeds a 48-bit creation timestamp
   * and would make the token partly predictable. It is now 32 raw random bytes, which is the
   * same decision carried further: 256 bits of entropy with no structure at all, and no version
   * nibble for anyone to reason from. Do not "fix" either of these back to v7.
   */
  const token = newToken()
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000)
  await db.insert(sessions).values({ id: uuidv4(), userId, tokenHash: digest(token), expiresAt })
  return { token, expiresAt }
}

export async function findValidSession(
  db: Queryable,
  token: string,
): Promise<{ userId: string } | null> {
  /**
   * NO SHAPE GUARD ANY MORE, and that is a simplification the hashing bought. The old code had
   * to refuse a non-uuid cookie before the query, because an attacker-controlled string reaching
   * Postgres as a `uuid` parameter raises 22P02 rather than matching no rows. Everything is
   * hashed to 64 hex characters first now, so no cookie value can be malformed by the time it
   * reaches the database.
   */
  const rows = await db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(and(eq(sessions.tokenHash, digest(token)), gt(sessions.expiresAt, new Date())))
    .limit(1)
  return rows[0] ?? null
}

export async function revokeSession(db: Queryable, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, digest(token)))
}

/**
 * Exported for the test that pins the one property this whole change rests on: what is stored is
 * not what is sent. Constant-time, so the test cannot be the thing that teaches a timing habit.
 */
export function hashMatches(token: string, storedHex: string): boolean {
  const a = Buffer.from(digest(token), 'hex')
  const b = Buffer.from(storedHex, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
