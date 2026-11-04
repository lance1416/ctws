import type { ProjectId, WorkspaceId } from '@ctws/contracts'
import { and, eq } from 'drizzle-orm'
import type { Queryable } from '../../platform/db/client'
import type { Actor } from '../../platform/db/scope'
import { projectLines } from './tables'

/** A week's line for a project, written over, or taken away with null. */
export async function setLine(
  q: Queryable,
  ctx: Actor,
  projectId: ProjectId,
  week: string,
  line: string | null,
): Promise<void> {
  if (line === null) {
    await q
      .delete(projectLines)
      .where(and(eq(projectLines.projectId, projectId), eq(projectLines.week, week)))
    return
  }
  await q
    .insert(projectLines)
    .values({ workspaceId: ctx.workspaceId, projectId, week, line, updatedAt: ctx.now })
    .onConflictDoUpdate({
      target: [projectLines.projectId, projectLines.week],
      set: { line, updatedAt: ctx.now },
    })
}

/** Every project's line for one week. */
export async function linesOf(q: Queryable, workspaceId: WorkspaceId, week: string) {
  return q
    .select({ projectId: projectLines.projectId, line: projectLines.line })
    .from(projectLines)
    .where(and(eq(projectLines.workspaceId, workspaceId), eq(projectLines.week, week)))
}
