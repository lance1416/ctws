import { type CircleId, circleId, type PutCirclesBody, type WorkspaceId } from '@ctws/contracts'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Queryable, Tx } from '../../platform/db/client'
import { newId } from '../../platform/db/ids'
import { NotFound } from '../../platform/errors'
import { rowsOf } from '../../platform/db/raw'
import { type Actor, scoped, within } from '../../platform/db/scope'
import { circles } from './tables'

const circleRow = z.object({ id: circleId, name: z.string(), count: z.number() })
export type CircleRow = z.infer<typeof circleRow>

/** The circles in your order, each with how many live people are in it. */
export async function listCircles(q: Queryable, workspaceId: WorkspaceId): Promise<CircleRow[]> {
  const result = await q.execute(sql`
    select c.id, c.name,
      (select count(*)::int from person_circles pc
         join people p on p.id = pc.person_id
       where pc.circle_id = c.id and p.deleted_at is null) as count
    from circles c
    where ${scoped(circles, workspaceId, 'c')}
    order by c.rank, c.id
  `)
  return rowsOf(result, circleRow)
}

/**
 * Makes the list the whole set (FR-049): renames the ones named by id, adds the ones without,
 * deletes the ones left out, and keeps the order given. Deleting a circle only takes the people
 * out of it. A renamed circle's id does not change, so nothing that points at it moves.
 */
export async function putCircles(tx: Tx, ctx: Actor, body: PutCirclesBody): Promise<CircleRow[]> {
  const have = await tx
    .select({ id: circles.id })
    .from(circles)
    .where(scoped(circles, ctx.workspaceId))
    .orderBy(asc(circles.rank))
  const known = new Set(have.map((c) => c.id))
  const kept = new Set<CircleId>()
  for (const c of body.circles) {
    if (c.id !== undefined && !known.has(c.id)) throw new NotFound('Circle')
    if (c.id !== undefined) kept.add(c.id)
  }
  const gone = have.filter((c) => !kept.has(c.id)).map((c) => c.id)
  if (gone.length > 0) await tx.delete(circles).where(inArray(circles.id, gone))
  // Two passes: ranks and names are unique, so every row moves aside before any takes a name.
  for (const [rank, c] of body.circles.entries()) {
    if (c.id !== undefined) {
      await tx
        .update(circles)
        // A name nobody types (Postgres text takes any character but NUL), unique by the id.
        .set({ rank: -1 - rank, name: `\u0001${c.id}` })
        .where(eq(circles.id, c.id))
    }
  }
  for (const [rank, c] of body.circles.entries()) {
    if (c.id !== undefined) {
      await tx.update(circles).set({ rank, name: c.name }).where(eq(circles.id, c.id))
    } else {
      await tx.insert(circles).values({
        id: newId(circleId),
        workspaceId: ctx.workspaceId,
        name: c.name,
        rank,
      })
    }
  }
  return listCircles(tx, ctx.workspaceId)
}

/** Every id names one of this workspace's circles, or none is used. */
export async function assertCirclesVisible(
  q: Queryable,
  workspaceId: WorkspaceId,
  ids: readonly CircleId[],
): Promise<void> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return
  const rows = await q
    .select({ id: circles.id })
    .from(circles)
    .where(within(scoped(circles, workspaceId), inArray(circles.id, unique)))
  if (rows.length !== unique.length) throw new NotFound('Circle')
}
