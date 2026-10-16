import { sql } from 'drizzle-orm'
import type { Db } from '../../../platform/db/client'
import { taskLog, type TaskCtx } from '../log'
import { lockVisibleTask } from '../queries/scope'
import { lockTaskTree } from '../tree'

/**
 * Soft-deletes a task and its live descendants, so no read has to check ancestors. Each gets its
 * own `deleted` event; a descendant's names the task the cascade started from.
 */
export async function softDeleteTask(db: Db, ctx: TaskCtx, id: string): Promise<void> {
  // As the database returns it, so the root is told apart from its descendants below.
  id = id.toLowerCase()
  await db.transaction(async (tx) => {
    await lockTaskTree(tx, ctx.workspaceId)
    const log = taskLog(tx, ctx)
    await lockVisibleTask(tx, ctx.workspaceId, id)

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
      update tasks set deleted_at = now(), updated_at = now()
      where id in (select id from subtree) and deleted_at is null
      returning id
    `)
    for (const { id: deletedId } of result.rows as { id: string }[]) {
      await log.append(deletedId, 'deleted', deletedId === id ? {} : { cascadedFrom: id })
    }
  })
}
