import { and, eq, gt } from 'drizzle-orm'
import { v4 as uuidv4, validate as isUuid } from 'uuid'
import type { Queryable } from '../db/client'
import { sessions } from '../db/schema'

export async function createSession(
  db: Queryable,
  userId: string,
  ttlDays: number,
): Promise<{ id: string; expiresAt: Date }> {
  // Session ids are opaque bearer credentials (design spec §10.1), not
  // entities — unlike the rest of the schema they must NOT be v7, since v7
  // embeds a 48-bit creation timestamp and would make the token partially
  // predictable/time-sortable. Use v4 here on purpose; do not "fix" this
  // back to v7 for consistency with other ids.
  const id = uuidv4()
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000)
  await db.insert(sessions).values({ id, userId, expiresAt })
  return { id, expiresAt }
}

export async function findValidSession(
  db: Queryable,
  id: string,
): Promise<{ userId: string } | null> {
  // Attacker-controlled cookie values must never reach Postgres as a raw
  // uuid query parameter: a malformed string raises 22P02 (invalid input
  // syntax for type uuid) rather than simply matching no rows.
  if (!isUuid(id)) return null

  const rows = await db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .limit(1)
  return rows[0] ?? null
}

export async function revokeSession(db: Queryable, id: string): Promise<void> {
  if (!isUuid(id)) return

  await db.delete(sessions).where(eq(sessions.id, id))
}
