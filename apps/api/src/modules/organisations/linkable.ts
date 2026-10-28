import { asc } from 'drizzle-orm'
import { scoped, within } from '../../platform/db/scope'
import { countWhere, matching, wanted, type Linkable } from '../../shell/links'
import { organisations } from './tables'

/** What a text is looked for in. */
const TEXT = ['organisations.name', 'organisations.type']

export const organisationLinkable: Linkable = {
  type: 'organisation',
  count: (q, workspaceId, text) =>
    countWhere(q, organisations, within(scoped(organisations, workspaceId), matching(TEXT, text))),
  rows: async (q, workspaceId, want) => {
    const { where, orderBy, limit, offset } = wanted(
      want,
      {
        id: organisations.id,
        title: organisations.name,
        text: TEXT,
      },
      [asc(organisations.name), asc(organisations.id)],
    )
    const found = await q
      .select({ id: organisations.id, name: organisations.name, type: organisations.type })
      .from(organisations)
      .where(within(scoped(organisations, workspaceId), where))
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset)
    return found.map((r) => ({
      type: 'organisation',
      id: r.id,
      title: r.name,
      organisationType: r.type,
    }))
  },
}
