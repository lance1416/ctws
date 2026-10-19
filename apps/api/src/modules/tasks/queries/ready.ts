import { type WorkspaceId } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { Queryable } from '../../../platform/db/client'
import { rowsOf } from '../../../platform/db/raw'
import { isLeafSql, pathRow, pathSql, TASK_COLUMNS } from './rows'
import { taskFinishedSql, visibleTasks } from './scope'

const readyRow = pathRow.omit({ parentTitle: true })
export type ReadyTask = z.output<typeof readyRow>

/**
 * Leaves that could be started now (FR-041): to do, in an unarchived project, waiting for no
 * unfinished task. Parents are never here, since their status is their children's. Oldest plan
 * first: a task planned for a day comes before one with no day, then by deadline, then by place
 * in its tree.
 */
export async function listReady(q: Queryable, workspaceId: WorkspaceId): Promise<ReadyTask[]> {
  const result = await q.execute(sql`
    select
      ${TASK_COLUMNS},
      p.name as "projectName",
      ${pathSql('t')} as path
    from tasks t
    join projects p on p.id = t.project_id
    where ${visibleTasks(workspaceId, { task: 't', project: 'p' })}
      and p.archived_at is null
      and t.status = 'todo'
      and ${isLeafSql('t')}
      and not exists (
        select 1 from task_dependencies d
        join tasks blocker on blocker.id = d.blocker_id
        where d.blocked_id = t.id
          and blocker.deleted_at is null
          and not ${taskFinishedSql('blocker')}
      )
    order by t.scheduled_on asc nulls last, t.due_at asc nulls last, p.rank, t.rank, t.id
  `)
  return rowsOf(result, readyRow)
}
