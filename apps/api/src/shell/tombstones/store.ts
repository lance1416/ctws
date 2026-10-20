import type { ObjectType, TombstonePlace, TombstoneResponse, WorkspaceId } from '@ctws/contracts'
import { and, eq, sql } from 'drizzle-orm'
import type { Queryable, Tx } from '../../platform/db/client'
import type { Actor } from '../../platform/db/scope'
import { tombstones } from './tables'

/** One thing going: what it is, what to call it afterwards, and where it was. */
export type Grave = {
  type: ObjectType
  id: string
  title: string
  place?: Partial<TombstonePlace>
}

const NOWHERE: TombstonePlace = {
  projectId: null,
  projectName: null,
  parentType: null,
  parentId: null,
  path: [],
}

/**
 * Buries things: writes each one's tombstone and clears what the shell kept about it, its change
 * log, its relations at either end and its resources. A note hung on it stays, on its own. The
 * caller deletes the rows themselves, in the same transaction, after this.
 */
export async function bury(tx: Tx, ctx: Actor, graves: readonly Grave[]): Promise<void> {
  if (graves.length === 0) return
  await tx
    .insert(tombstones)
    .values(
      graves.map((g) => ({
        workspaceId: ctx.workspaceId,
        objectType: g.type,
        objectId: g.id,
        title: g.title,
        deletedAt: ctx.now,
        place: { ...NOWHERE, ...g.place },
      })),
    )
    .onConflictDoNothing()
  const ends = sql.join(
    graves.map((g) => sql`(${g.type}, ${g.id}::uuid)`),
    sql`, `,
  )
  await tx.execute(sql`delete from events where (object_type, object_id) in (${ends})`)
  await tx.execute(sql`
    delete from relations
    where (from_type, from_id) in (${ends}) or (to_type, to_id) in (${ends})`)
  await tx.execute(sql`delete from resources where (owner_type, owner_id) in (${ends})`)
  await tx.execute(sql`
    update notes set anchor_type = null, anchor_id = null, occurrence_id = null, updated_at = ${ctx.now}
    where (anchor_type, anchor_id) in (${ends})`)
}

export async function getTombstone(
  q: Queryable,
  workspaceId: WorkspaceId,
  subject: { type: ObjectType; id: string },
): Promise<TombstoneResponse | null> {
  const [row] = await q
    .select()
    .from(tombstones)
    .where(
      and(
        eq(tombstones.workspaceId, workspaceId),
        eq(tombstones.objectType, subject.type),
        eq(tombstones.objectId, subject.id),
      ),
    )
  if (!row) return null
  return {
    type: row.objectType,
    id: row.objectId,
    title: row.title,
    deletedAt: row.deletedAt.toISOString(),
    place: row.place,
  }
}
