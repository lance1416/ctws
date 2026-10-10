import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { and, eq, gt, lt } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import type { Queryable } from '../db/client'
import { sessions } from '../db/schema'

/**
 * SESSIONS. The cookie carries a token; the database holds only its SHA-256 (D2).
 *
 * WHAT THE HASH BUYS. A stored token is a working session to anyone who can read the table --
 * nothing to crack, just a value to paste into a cookie jar. Reading rows shows someone your
 * tasks; holding a token lets them ACT as you until it expires. The read surface is wider than a
 * breach: a backup, a `pg_dump`, a `select * from sessions` pasted somewhere to debug something.
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

/**
 * HOW OFTEN A LIVE SESSION IS WRITTEN BACK.
 *
 * Sliding expiry means every authenticated request could extend the session, and a write on
 * every request is a write per page load for no gain. An hour of granularity costs at most an
 * hour off a thirty-day window and turns the write into one an hour per session.
 */
const TOUCH_AFTER_MS = 3_600_000

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
  // Signing in leaves a row and nothing ever removed one, so the table grew by one per login
  // forever. Swept HERE rather than on a schedule: it is the one moment this user is certainly
  // writing to this table anyway, the work is bounded by their own expired rows, and a personal
  // instance has nowhere to run a cron.
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())))
  await db.insert(sessions).values({ id: uuidv4(), userId, tokenHash: digest(token), expiresAt })
  return { token, expiresAt }
}

/**
 * The session behind a cookie, and the place its clock is wound on.
 *
 * SLIDING, not absolute. `last_seen_at` was written once at sign-in and never again, so the
 * thirty days ran from the login whether or not the app was used every day of them -- you were
 * signed out on day thirty for no reason you could see. It is an IDLE window now: thirty days
 * since you last used it.
 */
export async function findValidSession(
  db: Queryable,
  token: string,
  ttlDays: number,
): Promise<{ userId: string } | null> {
  /**
   * NO SHAPE GUARD on the cookie: hashing gives the query 64 hex characters whatever arrived, so
   * no value can reach Postgres malformed. A column compared against the raw token would need
   * one, because an attacker-controlled string bound as a `uuid` raises 22P02 rather than
   * matching no rows.
   */
  const hash = digest(token)
  const now = new Date()
  const rows = await db
    .select({ userId: sessions.userId, lastSeenAt: sessions.lastSeenAt })
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hash), gt(sessions.expiresAt, now)))
    .limit(1)
  const found = rows[0]
  if (!found) return null
  if (now.getTime() - found.lastSeenAt.getTime() >= TOUCH_AFTER_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + ttlDays * 86_400_000) })
      .where(eq(sessions.tokenHash, hash))
  }
  return { userId: found.userId }
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
