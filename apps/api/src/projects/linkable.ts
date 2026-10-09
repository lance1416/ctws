import { and, asc, inArray, sql } from 'drizzle-orm'
import { textMatches } from '../db/like'
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
  rows: async (q, workspaceId, want) => {
    const found = await q
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(
        and(
          visibleProjects(workspaceId),
          'ids' in want
            ? inArray(projects.id, [...want.ids])
            : want.text === ''
              ? undefined
              : textMatches(['projects.name'], want.text),
        ),
      )
      .orderBy(asc(projects.rank), asc(projects.id))
      .limit('ids' in want ? want.ids.length : want.limit)
    return found.map((r) => ({ id: r.id, title: r.name, detail: null }))
  },
}
