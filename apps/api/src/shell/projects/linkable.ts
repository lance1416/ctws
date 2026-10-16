import { asc } from 'drizzle-orm'
import { scoped, within } from '../../platform/db/scope'
import { wanted, type Linkable } from '../links/linkable'
import { projects } from './tables'

/** Projects are the shell's own, one kind of object among the rest. */
export const projectLinkable: Linkable = {
  type: 'project',
  label: 'Projects',
  rows: async (q, workspaceId, want) => {
    const { where, limit } = wanted(want, projects.id, ['projects.name'])
    const found = await q
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(within(scoped(projects, workspaceId), where))
      .orderBy(asc(projects.rank), asc(projects.id))
      .limit(limit)
    return found.map((r) => ({ id: r.id, title: r.name, detail: null }))
  },
}
