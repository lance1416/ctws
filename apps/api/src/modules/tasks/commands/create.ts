import { MAX_TASK_DEPTH, type CreateTaskBody } from '@ctws/contracts'
import { rankBetween } from '@ctws/core'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import type { Db } from '../../../platform/db/client'
import { visibleProjectId } from '../../../shell/projects/queries'
import { DepthLimitError } from '../errors'
import { taskLog, type TaskCtx } from '../log'
import { lockVisibleTask } from '../queries/scope'
import { tasks, type Task } from '../tables'
import { depthOf, lockTaskTree } from '../tree'

/**
 * Appends a task after its last sibling. Under a parent it takes the parent's project; the
 * requested project must still be visible, as on move.
 */
export async function createTask(db: Db, ctx: TaskCtx, input: CreateTaskBody): Promise<Task> {
  return db.transaction(async (tx) => {
    await lockTaskTree(tx, ctx.workspaceId)
    let projectId = await visibleProjectId(tx, ctx.workspaceId, input.projectId)

    if (input.parentId) {
      const parent = await lockVisibleTask(tx, ctx.workspaceId, input.parentId)
      if ((await depthOf(tx, parent.id)) + 1 > MAX_TASK_DEPTH) throw new DepthLimitError()
      projectId = parent.projectId
    }

    const [last] = await tx
      .select({ rank: tasks.rank })
      .from(tasks)
      .where(
        and(
          eq(tasks.projectId, projectId),
          input.parentId ? eq(tasks.parentId, input.parentId) : isNull(tasks.parentId),
          isNull(tasks.deletedAt),
        ),
      )
      .orderBy(desc(tasks.rank), desc(tasks.id))
      .limit(1)

    const [row] = await tx
      .insert(tasks)
      .values({
        id: uuidv7(),
        projectId,
        parentId: input.parentId ?? null,
        title: input.title,
        notes: input.notes ?? null,
        status: input.status,
        scheduledOn: input.scheduledOn ?? null,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        completedAt: input.status === 'done' ? sql`now()` : null,
        rank: rankBetween(last?.rank ?? null, null),
      })
      .returning()

    await taskLog(tx, ctx).append(row!.id, 'created', {
      from: null,
      to: { title: row!.title, status: row!.status, parentId: row!.parentId, projectId },
    })
    return row!
  })
}
