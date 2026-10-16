import { asc } from 'drizzle-orm'
import { scoped, within } from '../../platform/db/scope'
import { wanted, type Linkable } from '../../shell/links'
import { people } from './tables'

export const personLinkable: Linkable = {
  type: 'person',
  label: 'People',
  rows: async (q, workspaceId, want) => {
    const { where, limit } = wanted(want, people.id, ['people.name', 'people.org'])
    const found = await q
      .select({ id: people.id, name: people.name, org: people.org })
      .from(people)
      .where(within(scoped(people, workspaceId), where))
      .orderBy(asc(people.name), asc(people.id))
      .limit(limit)
    return found.map((r) => ({ id: r.id, title: r.name, detail: r.org }))
  },
}
