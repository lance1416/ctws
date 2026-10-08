import { and, eq, inArray } from 'drizzle-orm'
import { projects } from '../db/schema'
import type { Linkable } from '../links/linkable'
import { visibleProjects } from './store'

/**
 * 项目 names itself. It is the SHELL's, not a module's -- which is the whole point of this file:
 * a project is now one kind of object among five rather than the thing everything hangs off.
 */
export const projectLinkable: Linkable = {
  type: 'project',
  label: 'Projects',
  name: async (q, workspaceId, ids) => {
    const rows = await q
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(and(visibleProjects(workspaceId), inArray(projects.id, [...ids])))
    return new Map(rows.map((r) => [r.id, { title: r.name, detail: null }]))
  },
}
