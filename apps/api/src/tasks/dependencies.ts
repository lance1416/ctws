import { and, eq, sql } from 'drizzle-orm'
import type { Queryable } from '../db/client'
import { taskDependencies } from '../db/schema'
import { DependencyCycleError, TaskNotFoundError } from './errors'
import { appendEvent } from './events'
import type { TaskCtx } from './tasks'

/**
 * WHAT HAS TO HAPPEN FIRST.
 *
 * The edge is stored; "blocked" is not. A task is blocked while any of its blockers is
 * unfinished, which means finishing the blocker unblocks it with no second write and the two can
 * never disagree. Everything below is about keeping the EDGES honest -- the derived half is a
 * read, and it lives in the list queries.
 */

/** Enough of a task to name it on the other task's row, across projects. */
export type DependencyRef = {
  id: string
  title: string
  projectId: string
  projectName: string
  done: boolean
}

type RefRow = {
  id: string
  title: string
  project_id: string
  project_name: string
  done: boolean
}

const toRef = (r: RefRow): DependencyRef => ({
  id: r.id,
  title: r.title,
  projectId: r.project_id,
  projectName: r.project_name,
  done: r.done,
})

/** The visible task, or null. Visibility is the same predicate every other read here uses. */
async function visibleTask(q: Queryable, workspaceId: string, id: string): Promise<boolean> {
  const rows = await q.execute(sql`
    select 1 from tasks t
    join projects p on p.id = t.project_id
    where t.id = ${id}
      and t.deleted_at is null
      and p.workspace_id = ${workspaceId}
      and p.deleted_at is null
  `)
  return rows.rows.length > 0
}

/**
 * Would `blocker -> blocked` close a loop?
 *
 * It would exactly when `blocked` is ALREADY a transitive blocker of `blocker` -- walk up from
 * `blocker` through "what is this waiting for" and see whether `blocked` turns up.
 *
 * `union`, NOT `union all`. The graph is a DAG by induction (every edge that would have closed a
 * loop was refused), so the walk terminates either way; what `union all` would do is re-walk a
 * node once per path reaching it, which on a diamond is exponential. The same lesson is written
 * on `move`'s traversal, which learned it the hard way.
 */
async function wouldCycle(
  q: Queryable,
  workspaceId: string,
  blockerId: string,
  blockedId: string,
): Promise<boolean> {
  const rows = await q.execute(sql`
    with recursive upstream(id) as (
      select ${blockerId}::uuid
      union
      select d.blocker_id
      from task_dependencies d
      join upstream u on u.id = d.blocked_id
      where d.workspace_id = ${workspaceId}
    )
    select 1 from upstream where id = ${blockedId}::uuid
  `)
  return rows.rows.length > 0
}

/**
 * Records that `blockedId` waits for `blockerId`.
 *
 * Idempotent: asking twice is not an error, because the second ask describes the same world as
 * the first. It is also what a double-click produces.
 */
export async function addDependency(
  q: Queryable,
  ctx: TaskCtx,
  blockedId: string,
  blockerId: string,
): Promise<void> {
  if (blockedId === blockerId) throw new DependencyCycleError()
  // Both ends are checked, and both against THIS workspace: an id from somewhere else must read
  // as "no such task", never as a refusal that confirms it exists.
  if (!(await visibleTask(q, ctx.workspaceId, blockedId))) throw new TaskNotFoundError()
  if (!(await visibleTask(q, ctx.workspaceId, blockerId))) throw new TaskNotFoundError()
  if (await wouldCycle(q, ctx.workspaceId, blockerId, blockedId)) throw new DependencyCycleError()

  await q
    .insert(taskDependencies)
    .values({ blockerId, blockedId, workspaceId: ctx.workspaceId })
    .onConflictDoNothing()
  await appendEvent(q, {
    taskId: blockedId,
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actorUserId,
    type: 'dependency_added',
    payload: { blockerId },
  })
}

/** Forgets that `blockedId` waits for `blockerId`. Also idempotent. */
export async function removeDependency(
  q: Queryable,
  ctx: TaskCtx,
  blockedId: string,
  blockerId: string,
): Promise<void> {
  const removed = await q
    .delete(taskDependencies)
    .where(
      and(
        eq(taskDependencies.blockedId, blockedId),
        eq(taskDependencies.blockerId, blockerId),
        eq(taskDependencies.workspaceId, ctx.workspaceId),
      ),
    )
    .returning({ blockerId: taskDependencies.blockerId })
  if (removed.length === 0) return
  await appendEvent(q, {
    taskId: blockedId,
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actorUserId,
    type: 'dependency_removed',
    payload: { blockerId },
  })
}

/**
 * Both directions for one task, FINISHED BLOCKERS INCLUDED.
 *
 * The pane shows the whole arrangement, not only what is still in the way: a blocker that is
 * already finished is a fact about this task worth seeing, and it is the only way to find the
 * edge in order to remove it.
 */
export async function taskDependencyLists(
  q: Queryable,
  workspaceId: string,
  taskId: string,
): Promise<{ blockedBy: DependencyRef[]; blocks: DependencyRef[] }> {
  const query = (column: 'blocker_id' | 'blocked_id', match: 'blocked_id' | 'blocker_id') => sql`
    select
      t.id, t.title, p.id as project_id, p.name as project_name,
      (t.status in ('done', 'cancelled')) as done
    from task_dependencies d
    join tasks t on t.id = ${sql.raw(`d.${column}`)}
    join projects p on p.id = t.project_id
    where ${sql.raw(`d.${match}`)} = ${taskId}
      and d.workspace_id = ${workspaceId}
      and t.deleted_at is null
      and p.deleted_at is null
    order by p.rank, t.rank, t.id
  `
  const [up, down] = await Promise.all([
    q.execute(query('blocker_id', 'blocked_id')),
    q.execute(query('blocked_id', 'blocker_id')),
  ])
  return {
    blockedBy: (up.rows as RefRow[]).map(toRef),
    blocks: (down.rows as RefRow[]).map(toRef),
  }
}

/**
 * WHAT IS STILL IN THE WAY, for a set of tasks at once -- the half the LISTS need.
 *
 * Only unfinished blockers: a row is drawn blocked or it is not, and a blocker that is done is
 * not blocking anything. Keyed by the waiting task's id; a task with nothing in its way is
 * absent rather than present-and-empty, so the caller's `?? []` is the only shape it needs.
 */
export async function blockersFor(
  q: Queryable,
  workspaceId: string,
  taskIds: readonly string[],
): Promise<Map<string, DependencyRef[]>> {
  const out = new Map<string, DependencyRef[]>()
  if (taskIds.length === 0) return out
  const rows = await q.execute(sql`
    select
      d.blocked_id,
      t.id, t.title, p.id as project_id, p.name as project_name, false as done
    from task_dependencies d
    join tasks t on t.id = d.blocker_id
    join projects p on p.id = t.project_id
    where d.workspace_id = ${workspaceId}
      and d.blocked_id in ${taskIds}
      and t.deleted_at is null
      and p.deleted_at is null
      and t.status not in ('done', 'cancelled')
    order by p.rank, t.rank, t.id
  `)
  for (const row of rows.rows as (RefRow & { blocked_id: string })[]) {
    const list = out.get(row.blocked_id)
    if (list) list.push(toRef(row))
    else out.set(row.blocked_id, [toRef(row)])
  }
  return out
}
