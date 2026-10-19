import { taskId } from '@ctws/contracts'
import { sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { columnShape, columnsOf } from '../../../platform/db/raw'
import { ident } from '../../../platform/db/sql'
import { tasks } from '../tables'

/** Every task column under the alias `t`, each named by its field. */
export const TASK_COLUMNS = columnsOf(tasks, 't')

/** A task read by raw SQL, with its project and parent named as `projectName` and `parentTitle`. */
export const taskRow = z.object({
  ...columnShape(tasks),
  projectName: z.string(),
  parentTitle: z.string().nullable(),
})

/** The task under the alias has no live children: a leaf, whose status is its own (FR-037). */
export const isLeafSql = (task: string): SQL =>
  sql`not exists (
    select 1 from tasks child
    where child.parent_id = ${ident(task)}.id and child.deleted_at is null
  )`

/**
 * The task's ancestors as a JSON array, root first, parent last; `[]` directly under the project.
 * A chain is at most MAX_TASK_DEPTH long, so the walk per row is bounded.
 */
export const pathSql = (task: string): SQL =>
  sql`(
    with recursive up(id, parent_id, title, depth) as (
      select a.id, a.parent_id, a.title, 1 from tasks a where a.id = ${ident(task)}.parent_id
      union all
      select a.id, a.parent_id, a.title, up.depth + 1 from tasks a join up on a.id = up.parent_id
    )
    select coalesce(
      json_agg(json_build_object('id', id, 'title', title) order by depth desc),
      '[]'::json
    ) from up
  )`

/** `taskRow` with its path. */
export const pathRow = taskRow.extend({
  path: z.array(z.object({ id: taskId, title: z.string() })),
})
