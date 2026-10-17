import { asc } from 'drizzle-orm'
import { scoped, within } from '../../platform/db/scope'
import { wanted, type Linkable } from '../../shell/links'
import { people } from './tables'

export const personLinkable: Linkable = {
  type: 'person',
  rows: async (q, workspaceId, want) => {
    const { where, orderBy, limit } = wanted(
      want,
      { id: people.id, title: people.name, text: ['people.name', 'people.org'] },
      [asc(people.name), asc(people.id)],
    )
    const found = await q
      .select({ id: people.id, name: people.name, org: people.org })
      .from(people)
      .where(within(scoped(people, workspaceId), where))
      .orderBy(...orderBy)
      .limit(limit)
    return found.map((r) => ({ type: 'person', id: r.id, title: r.name, org: r.org }))
  },
}
