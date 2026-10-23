import {
  type ProjectId,
  type PutStagesBody,
  type StageId,
  stageId,
  type StageResponse,
  type WorkspaceId,
} from '@ctws/contracts'
import { eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Queryable, Tx } from '../../platform/db/client'
import { newId } from '../../platform/db/ids'
import { DomainError, NotFound } from '../../platform/errors'
import { rowsOf } from '../../platform/db/raw'
import { type Actor, scoped, within } from '../../platform/db/scope'
import { groupBy } from '../../platform/values'
import { eventLog } from '../events'
import { projectStages } from './tables'

/** A stage still in use cannot go (FR-040): the tasks at it have to be moved first. */
class StageInUse extends DomainError {
  constructor(name: string, count: number) {
    super('conflict', {
      detail: `${count} ${count === 1 ? 'task is' : 'tasks are'} at ${name}; move them first`,
    })
  }
}

/** A rename that lands on another stage's name: the client asks whether to merge (FR-040). */
class StageNameTaken extends DomainError {
  constructor(name: string) {
    super('conflict', { detail: `${name} already exists` })
  }
}

const stageRow = z.object({
  id: stageId,
  projectId: z.string(),
  name: z.string(),
  collapsed: z.boolean(),
  count: z.number(),
})

/** Each project's stages in order, with how many live tasks are at each. */
export async function stagesOf(
  q: Queryable,
  workspaceId: WorkspaceId,
  projectIds: readonly ProjectId[],
): Promise<Map<ProjectId, StageResponse[]>> {
  if (projectIds.length === 0) return new Map()
  const result = await q.execute(sql`
    select s.id, s.project_id as "projectId", s.name, s.collapsed,
      (select count(*)::int from tasks t where t.stage_id = s.id and t.deleted_at is null) as count
    from project_stages s
    where ${scoped(projectStages, workspaceId, 's')}
      and s.project_id in (${sql.join(
        projectIds.map((id) => sql`${id}`),
        sql`, `,
      )})
    order by s.rank, s.id
  `)
  return groupBy(
    rowsOf(result, stageRow),
    (r) => r.projectId as ProjectId,
    (r): StageResponse => ({ id: r.id, name: r.name, collapsed: r.collapsed, count: r.count }),
  )
}

/** One stage of one project, or not found. */
export async function getStage(
  q: Queryable,
  workspaceId: WorkspaceId,
  projectId: ProjectId,
  id: StageId,
): Promise<{ id: StageId; name: string }> {
  const [row] = await q
    .select({ id: projectStages.id, name: projectStages.name })
    .from(projectStages)
    .where(
      within(
        scoped(projectStages, workspaceId),
        eq(projectStages.projectId, projectId),
        eq(projectStages.id, id),
      ),
    )
  if (!row) throw new NotFound('Stage')
  return row
}

/**
 * Makes the list the whole set of a project's stages (FR-040, REQ v1.4): the order given is the
 * order; one named by id is renamed, one without is new, one left out is removed, which only an
 * unused stage may be. A rename is logged on each task at the stage. A rename onto an existing name
 * is refused unless the entry says which stage to merge into; then its tasks move there, each
 * logged, and it goes.
 */
/** A stage merged into itself would be a stage removed by accident. */
class MergeIntoItself extends DomainError {
  constructor() {
    super('unprocessable', { detail: 'A stage cannot be merged into itself.' })
  }
}

export async function putStages(
  tx: Tx,
  ctx: Actor,
  projectId: ProjectId,
  body: PutStagesBody,
): Promise<StageResponse[]> {
  const current = (await stagesOf(tx, ctx.workspaceId, [projectId])).get(projectId) ?? []
  const byId = new Map(current.map((s) => [s.id, s]))
  for (const entry of body.stages) {
    if (entry.id !== undefined && !byId.has(entry.id)) throw new NotFound('Stage')
    if (entry.mergeInto !== undefined && !byId.has(entry.mergeInto)) throw new NotFound('Stage')
    if (entry.mergeInto !== undefined && entry.mergeInto === entry.id) throw new MergeIntoItself()
  }

  // Merges first: the merged stage's tasks move, then it is treated as left out.
  const merged = new Set<StageId>()
  for (const entry of body.stages) {
    if (entry.id === undefined || entry.mergeInto === undefined) continue
    const into = byId.get(entry.mergeInto)!
    const from = byId.get(entry.id)!
    const moved = await tx.execute(sql`
      update tasks set stage_id = ${into.id}, stage_since = ${ctx.now.toISOString()}::timestamptz
      where stage_id = ${from.id} and deleted_at is null
      returning id
    `)
    await eventLog(tx, ctx).appendAll(
      rowsOf(moved, z.object({ id: z.string() })).map((t) => ({
        subject: { type: 'task' as const, id: t.id },
        type: 'stage_changed',
        payload: { from: from.name, to: into.name, merged: true },
      })),
    )
    merged.add(from.id)
  }

  const kept = body.stages.filter((e) => e.id === undefined || !merged.has(e.id))
  const keptIds = new Set(kept.flatMap((e) => (e.id === undefined ? [] : [e.id])))
  const gone = current.filter((s) => !keptIds.has(s.id))
  for (const s of gone) {
    if (!merged.has(s.id) && s.count > 0) throw new StageInUse(s.name, s.count)
  }
  // A new name that another kept stage already has, without a merge, is a question for the client.
  // Case does not tell two stages apart (REQ v1.5).
  const names = new Set<string>()
  for (const e of kept) {
    if (names.has(e.name.toLowerCase())) throw new StageNameTaken(e.name)
    names.add(e.name.toLowerCase())
  }

  if (gone.length > 0) {
    await tx.delete(projectStages).where(
      inArray(
        projectStages.id,
        gone.map((s) => s.id),
      ),
    )
  }
  // A rename is logged on each task at the stage, as a rename and not a move: the review's "Stages
  // moved" leaves it out, and the days at the stage go on (BUG-045).
  for (const e of kept) {
    const was = e.id === undefined ? undefined : byId.get(e.id)
    if (!was || was.name === e.name) continue
    const at = await tx.execute(sql`
      select id from tasks where stage_id = ${was.id} and deleted_at is null
    `)
    await eventLog(tx, ctx).appendAll(
      rowsOf(at, z.object({ id: z.string() })).map((t) => ({
        subject: { type: 'task' as const, id: t.id },
        type: 'stage_renamed',
        payload: { from: was.name, to: e.name },
      })),
    )
  }

  // Two passes: names are unique per project, so every kept row moves aside before any is named.
  for (const [rank, e] of kept.entries()) {
    if (e.id !== undefined) {
      await tx
        .update(projectStages)
        .set({ rank: -1 - rank, name: `\u0001${e.id}` })
        .where(eq(projectStages.id, e.id))
    }
  }
  for (const [rank, e] of kept.entries()) {
    if (e.id !== undefined) {
      await tx
        .update(projectStages)
        .set({ rank, name: e.name, collapsed: e.collapsed ?? false })
        .where(eq(projectStages.id, e.id))
    } else {
      await tx.insert(projectStages).values({
        id: newId(stageId),
        workspaceId: ctx.workspaceId,
        projectId,
        name: e.name,
        rank,
        collapsed: e.collapsed ?? false,
        createdAt: ctx.now,
      })
    }
  }
  return (await stagesOf(tx, ctx.workspaceId, [projectId])).get(projectId) ?? []
}

/** The stages in order, for a read that lists one project. */
export async function listStages(
  q: Queryable,
  workspaceId: WorkspaceId,
  projectId: ProjectId,
): Promise<StageResponse[]> {
  return (await stagesOf(q, workspaceId, [projectId])).get(projectId) ?? []
}
