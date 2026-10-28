import {
  projectId,
  type ProjectId,
  type ProjectStanding,
  type TaskId,
  type TaskStatus,
  type WorkspaceId,
} from '@ctws/contracts'
import { desc, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import type { Queryable } from '../../platform/db/client'
import { rowsOf } from '../../platform/db/raw'
import { within } from '../../platform/db/scope'
import { matching, wanted, type Linkable } from '../../shell/links'
import { visibleTasks } from './queries'
import { tasks } from './tables'

/** Live tasks this workspace can see where `where` holds, each with its project's name. */
const taskRows = (q: Queryable, workspaceId: WorkspaceId, where: SQL | undefined) =>
  q
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      projectId: tasks.projectId,
      projectName: sql<string>`p.name`,
      parentTitle: sql<string | null>`parent.title`,
      dueAt: tasks.dueAt,
      scheduledOn: tasks.scheduledOn,
    })
    .from(tasks)
    .innerJoin(sql`projects p`, sql`p.id = ${tasks.projectId}`)
    .leftJoin(sql`tasks parent`, sql`parent.id = ${tasks.parentId}`)
    .where(within(visibleTasks(workspaceId, { task: 'tasks', project: 'p' }), where))
    .$dynamic()

/**
 * A task as a list of things names it: every reader is cross-project, so with its project, and the
 * task it sits under.
 */
const named = (r: {
  id: TaskId
  title: string
  status: TaskStatus
  projectId: ProjectId
  projectName: string
  parentTitle: string | null
  dueAt: Date | null
  scheduledOn: string | null
}) => ({
  type: 'task' as const,
  id: r.id,
  title: r.title,
  status: r.status,
  projectId: r.projectId,
  projectName: r.projectName,
  parentTitle: r.parentTitle,
  dueAt: r.dueAt?.toISOString() ?? null,
  scheduledOn: r.scheduledOn,
})

const COLUMNS = { id: tasks.id, title: tasks.title, text: ['tasks.title'] }

/** Tasks by id or by title, each with the project it is in. */
export const taskLinkable: Linkable = {
  type: 'task',
  // Counted as `taskRows` finds them: visible in a visible project.
  count: async (q, workspaceId, text) => {
    const [row] = await q
      .select({ n: sql<number>`count(*)::int` })
      .from(tasks)
      .innerJoin(sql`projects p`, sql`p.id = ${tasks.projectId}`)
      .where(
        within(
          visibleTasks(workspaceId, { task: 'tasks', project: 'p' }),
          matching(COLUMNS.text, text),
        ),
      )
    return row?.n ?? 0
  },
  rows: async (q, workspaceId, want) => {
    const { where, orderBy, limit, offset } = wanted(want, COLUMNS, [
      desc(tasks.createdAt),
      desc(tasks.id),
    ])
    const found = await taskRows(q, workspaceId, where)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset)
    return found.map(named)
  },
  standingOf,
}

/**
 * Where each thing stands in projects (FR-064, FR-065): the live nodes related to it, by hand or by
 * a mention, one a project. Of several in one project, the one at a stage, most recently moved to
 * it, speaks for the project; the projects come in that order too.
 */
async function standingOf(
  q: Queryable,
  workspaceId: WorkspaceId,
  about: readonly string[],
): Promise<Map<string, ProjectStanding[]>> {
  const out = new Map<string, ProjectStanding[]>()
  if (about.length === 0) return out
  const wanted = sql.join(
    about.map((id) => sql`${id}::uuid`),
    sql`, `,
  )
  const rows = rowsOf(
    await q.execute(sql`
      select * from (
        select distinct on (x.about, t.project_id)
               x.about::text as "aboutId", t.project_id as "projectId", p.name as "projectName",
               s.name as "stage", t.stage_since as "since"
        from tasks t
        join projects p on p.id = t.project_id
        join lateral (
          select r.to_id as about from relations r
          where r.from_type = 'task' and r.from_id = t.id and r.to_id in (${wanted})
          union
          select r.from_id from relations r
          where r.to_type = 'task' and r.to_id = t.id and r.from_id in (${wanted})
        ) x on true
        left join project_stages s on s.id = t.stage_id
        where ${visibleTasks(workspaceId, { task: 't', project: 'p' })}
        order by x.about, t.project_id, (s.name is null), t.stage_since desc nulls last,
                 t.updated_at desc
      ) one
      order by "aboutId", ("stage" is null), "since" desc nulls last, "projectName" collate "C"`),
    z.object({
      aboutId: z.string(),
      projectId,
      projectName: z.string(),
      stage: z.string().nullable(),
      since: z.unknown(),
    }),
  )
  for (const r of rows) {
    const standing = { projectId: r.projectId, projectName: r.projectName, stage: r.stage }
    out.set(r.aboutId, [...(out.get(r.aboutId) ?? []), standing])
  }
  return out
}
