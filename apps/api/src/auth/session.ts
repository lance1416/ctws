import { and, eq, gt } from 'drizzle-orm'
import { v7 as uuidv7, validate as isUuid } from 'uuid'
import type { Db } from '../db/client'
import { sessions } from '../db/schema'

export async function createSession(
  db: Db,
  userId: string,
  ttlDays: number,
): Promise<{ id: string; expiresAt: Date }> {
  const id = uuidv7()
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000)
  await db.insert(sessions).values({ id, userId, expiresAt })
  return { id, expiresAt }
}

export async function findValidSession(db: Db, id: string): Promise<{ userId: string } | null> {
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

export async function revokeSession(db: Db, id: string): Promise<void> {
  if (!isUuid(id)) return

  await db.delete(sessions).where(eq(sessions.id, id))
}
