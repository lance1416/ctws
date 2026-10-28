import { asc } from 'drizzle-orm'
import { scoped, within } from '../../platform/db/scope'
import { countWhere, matching, wanted, type Linkable } from '../links/linkable'
import { projects } from './tables'

/** Projects are the shell's own, one kind of object among the rest. */
/** What a text is looked for in. */
const TEXT = ['projects.name']

export const projectLinkable: Linkable = {
  type: 'project',
  count: (q, workspaceId, text) =>
    countWhere(q, projects, within(scoped(projects, workspaceId), matching(TEXT, text))),
  rows: async (q, workspaceId, want) => {
    const { where, orderBy, limit, offset } = wanted(
      want,
      { id: projects.id, title: projects.name, text: TEXT },
      [asc(projects.rank), asc(projects.id)],
    )
    const found = await q
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(within(scoped(projects, workspaceId), where))
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset)
    return found.map((r) => ({ type: 'project', id: r.id, title: r.name }))
  },
}
