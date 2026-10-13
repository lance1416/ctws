import { DAY_MS } from '@ctws/contracts'
import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, lt } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import type { Queryable } from '../../platform/db/client'
import { sessions } from './tables'

/**
 * The cookie carries a token; the database keeps only its SHA-256, so a leaked table or backup
 * holds no working session. A fast digest suffices: the token is random, with nothing to guess.
 */

/** 32 random bytes, base64url. */
const newToken = (): string => randomBytes(32).toString('base64url')

const digest = (token: string): string => createHash('sha256').update(token).digest('hex')

/** A live session is written back at most this often, not on every request. */
const TOUCH_AFTER_MS = 3_600_000

export async function createSession(
  db: Queryable,
  userId: string,
  ttlDays: number,
): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken()
  const expiresAt = new Date(Date.now() + ttlDays * DAY_MS)
  // The user's expired sessions are swept here, the one moment they are certainly writing.
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())))
  await db.insert(sessions).values({ id: uuidv4(), userId, tokenHash: digest(token), expiresAt })
  return { token, expiresAt }
}

/**
 * The session behind a cookie. The expiry slides: it is an idle window, renewed by use. Any
 * cookie value hashes to well-formed hex, so none needs checking first.
 */
export async function findValidSession(
  db: Queryable,
  token: string,
  ttlDays: number,
): Promise<{ userId: string } | null> {
  const hash = digest(token)
  const now = new Date()
  const [found] = await db
    .select({ userId: sessions.userId, lastSeenAt: sessions.lastSeenAt })
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hash), gt(sessions.expiresAt, now)))
    .limit(1)
  if (!found) return null
  if (now.getTime() - found.lastSeenAt.getTime() >= TOUCH_AFTER_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + ttlDays * DAY_MS) })
      .where(eq(sessions.tokenHash, hash))
  }
  return { userId: found.userId }
}

export async function revokeSession(db: Queryable, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, digest(token)))
}
