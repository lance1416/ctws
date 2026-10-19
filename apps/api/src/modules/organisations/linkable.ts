import { asc } from 'drizzle-orm'
import { scoped, within } from '../../platform/db/scope'
import { wanted, type Linkable } from '../../shell/links'
import { organisations } from './tables'

export const organisationLinkable: Linkable = {
  type: 'organisation',
  rows: async (q, workspaceId, want) => {
    const { where, orderBy, limit } = wanted(
      want,
      {
        id: organisations.id,
        title: organisations.name,
        text: ['organisations.name', 'organisations.type'],
      },
      [asc(organisations.name), asc(organisations.id)],
    )
    const found = await q
      .select({ id: organisations.id, name: organisations.name, type: organisations.type })
      .from(organisations)
      .where(within(scoped(organisations, workspaceId), where))
      .orderBy(...orderBy)
      .limit(limit)
    return found.map((r) => ({
      type: 'organisation',
      id: r.id,
      title: r.name,
      organisationType: r.type,
    }))
  },
}
