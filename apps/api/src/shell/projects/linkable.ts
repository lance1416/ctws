import { asc } from 'drizzle-orm'
import { scoped, within } from '../../platform/db/scope'
import { wanted, type Linkable } from '../links/linkable'
import { projects } from './tables'

/** Projects are the shell's own, one kind of object among the rest. */
export const projectLinkable: Linkable = {
  type: 'project',
  rows: async (q, workspaceId, want) => {
    const { where, orderBy, limit } = wanted(
      want,
      { id: projects.id, title: projects.name, text: ['projects.name'] },
      [asc(projects.rank), asc(projects.id)],
    )
    const found = await q
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(within(scoped(projects, workspaceId), where))
      .orderBy(...orderBy)
      .limit(limit)
    return found.map((r) => ({ type: 'project', id: r.id, title: r.name }))
  },
}
