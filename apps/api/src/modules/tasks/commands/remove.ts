import { taskId, type TaskId } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../../../platform/db/client'
import { rowsOf } from '../../../platform/db/raw'
import { instant } from '../../../platform/db/time'
import type { Actor } from '../../../platform/db/scope'
import { taskLog } from '../log'
import { lockTask } from '../queries/scope'
import { lockTaskTree } from '../tree'

/**
 * Soft-deletes a task and its live descendants, so no read has to check ancestors. Each gets its
 * own `deleted` event; a descendant's names the task the cascade started from.
 */
export async function softDeleteTask(db: Db, ctx: Actor, id: TaskId): Promise<void> {
  await db.transaction(async (tx) => {
    await lockTaskTree(tx, ctx.workspaceId)
    const log = taskLog(tx, ctx)
    await lockTask(tx, ctx.workspaceId, id)

    // The two `deleted_at is null` differ: the recursive one prunes, so an already-deleted
    // descendant keeps its own `deleted_at`; the update's one refuses to overwrite and picks the
    // rows that get an event. They disagree only on a live task under a deleted parent, which
    // move (refusing a deleted parent), create (the visibility predicate) and the tree lock rule out.
    const result = await tx.execute(sql`
      with recursive subtree(id) as (
        select ${id}::uuid
        union
        select t.id from tasks t join subtree s on t.parent_id = s.id where t.deleted_at is null
      )
      update tasks set deleted_at = ${instant(ctx.now)}, updated_at = ${instant(ctx.now)}
      where id in (select id from subtree) and deleted_at is null
      returning id
    `)
    for (const { id: deletedId } of rowsOf(result, z.object({ id: taskId }))) {
      await log.append(deletedId, 'deleted', deletedId === id ? {} : { cascadedFrom: id })
    }
  })
}
