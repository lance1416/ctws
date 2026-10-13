import type { DependencyRef } from '@ctws/contracts'
import type { Rollup } from '@ctws/core'
import { and, asc, eq, isNull } from 'drizzle-orm'
import type { Db, Queryable } from '../../../platform/db/client'
import { assertProjectVisible } from '../../../shell/projects/store'
import { tasks, type Task } from '../tables'
import { blockersFor } from './dependencies'
import { projectRollups } from './rollup'

/** Every live task of a project in sibling order, flat; the client builds the tree. */
export async function listProjectTasks(
  q: Queryable,
  workspaceId: string,
  projectId: string,
): Promise<Task[]> {
  await assertProjectVisible(q, workspaceId, projectId)
  return q
    .select()
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.rank), asc(tasks.id))
}

/**
 * The project page's three reads share one snapshot, or a task finished between them would show
 * open beside a rollup that already counts it. Read committed takes a snapshot per statement.
 */
export const BOARD_TX = { isolationLevel: 'repeatable read', accessMode: 'read only' } as const

export type ProjectBoard = {
  tasks: Task[]
  rollups: Map<string, Rollup>
  blockers: Map<string, DependencyRef[]>
}

export async function projectBoard(
  db: Db,
  workspaceId: string,
  projectId: string,
  timezone: string,
  now: Date,
): Promise<ProjectBoard> {
  return db.transaction(async (tx) => {
    const tasks = await listProjectTasks(tx, workspaceId, projectId)
    const rollups = await projectRollups(tx, workspaceId, projectId, timezone, now)
    const blockers = await blockersFor(
      tx,
      workspaceId,
      tasks.map((t) => t.id),
    )
    return { tasks, rollups, blockers }
  }, BOARD_TX)
}
