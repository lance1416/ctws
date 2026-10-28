import { DAY_MS, type UserId } from '@ctws/contracts'
import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNull, lt, ne } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import type { Queryable } from '../../platform/db/client'
import { type Account, ACCOUNT, FIRST_WORKSPACE } from './service'
import { sessions, users, workspaceMembers } from './tables'

/**
 * The cookie carries a token; the database keeps only its SHA-256, so a leaked table or backup
 * holds no working session. A fast digest suffices: the token is random, with nothing to guess.
 */

/** 32 random bytes, base64url. */
const newToken = (): string => randomBytes(32).toString('base64url')

const digest = (token: string): string => createHash('sha256').update(token).digest('hex')

/** A live session is written back at most this often, not on every request. */
const TOUCH_AFTER_MS = 3_600_000

/** How long a session lives unused, and the instant it is asked at. */
type Window = { ttlDays: number; now: Date }

export async function createSession(
  db: Queryable,
  userId: UserId,
  { ttlDays, now }: Window,
): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken()
  const expiresAt = new Date(now.getTime() + ttlDays * DAY_MS)
  // The user's expired sessions are swept here, the one moment they are certainly writing.
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, now)))
  await db.insert(sessions).values({
    id: uuidv4(),
    userId,
    tokenHash: digest(token),
    expiresAt,
    createdAt: now,
    lastSeenAt: now,
  })
  return { token, expiresAt }
}

/**
 * The enabled account behind a cookie's live session, in one read, made on every request so
 * disabling or demoting an account applies at once. The expiry slides: it is an idle window,
 * renewed by use, and `renewedUntil` is the new expiry for the cookie when this read renewed it.
 * Any cookie value hashes to well-formed hex, so none needs checking first.
 */
export async function findSessionAccount(
  db: Queryable,
  token: string,
  { ttlDays, now }: Window,
): Promise<{ account: Account; renewedUntil: Date | null } | null> {
  const hash = digest(token)
  const [found] = await db
    .select({ account: ACCOUNT, lastSeenAt: sessions.lastSeenAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
    .where(and(eq(sessions.tokenHash, hash), gt(sessions.expiresAt, now), isNull(users.disabledAt)))
    .orderBy(...FIRST_WORKSPACE)
    .limit(1)
  if (!found) return null
  const { account } = found
  if (now.getTime() - found.lastSeenAt.getTime() < TOUCH_AFTER_MS) {
    return { account, renewedUntil: null }
  }
  const expiresAt = new Date(now.getTime() + ttlDays * DAY_MS)
  await db.update(sessions).set({ lastSeenAt: now, expiresAt }).where(eq(sessions.tokenHash, hash))
  return { account, renewedUntil: expiresAt }
}

export async function revokeSession(db: Queryable, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, digest(token)))
}

/** Ends every session of the account but the one `keep` is the token of. */
export async function revokeOtherSessions(
  db: Queryable,
  userId: UserId,
  keep: string,
): Promise<void> {
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), ne(sessions.tokenHash, digest(keep))))
}
