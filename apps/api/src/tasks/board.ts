import type { DependencyRef } from '@ctws/contracts'
import type { Rollup } from '@ctws/core'
import type { Db } from '../db/client'
import { blockersFor } from './dependencies'
import { projectRollups } from './rollup'
import { listProjectTasks, type Task } from './tasks'

/**
 * EVERYTHING ONE PROJECT PAGE SHOWS, read as one answer.
 *
 * Three reads: the rows, the rollup each parent reports, and what each row is waiting for. They
 * are three because the shapes differ -- rows are rows, a rollup is two computed flags and a
 * joined max, blockers are an edge table keyed by task -- and widening any of them into the
 * others would make its result no longer a row.
 *
 * ONE SNAPSHOT, THOUGH. Read separately they can disagree about the same screen: a task finished
 * between the first and the second draws as open in the tree while the number above it already
 * counts it done, and the reader is looking at a page that contradicts itself. A plain
 * transaction is not enough -- READ COMMITTED takes a NEW snapshot per statement -- so the level
 * is `repeatable read`, which is what actually holds one snapshot across the three.
 *
 * `read only` as well, because that is true and lets Postgres say so if it ever stops being.
 */
/**
 * The transaction the three reads share, named so there is ONE place that says which level, and
 * so a test can hold the same kind of transaction open and prove the level does what is claimed.
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
): Promise<ProjectBoard> {
  return db.transaction(
    async (tx) => {
      const tasks = await listProjectTasks(tx, workspaceId, projectId)
      const rollups = await projectRollups(tx, workspaceId, projectId, timezone)
      const blockers = await blockersFor(
        tx,
        workspaceId,
        tasks.map((t) => t.id),
      )
      return { tasks, rollups, blockers }
    },
    BOARD_TX,
  )
}
