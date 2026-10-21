import { avatarInitials, currentRole } from '@ctws/core'
import { asc } from 'drizzle-orm'
import { scoped, within } from '../../platform/db/scope'
import { wanted, type Linkable } from '../../shell/links'
import { rolesOf } from '../organisations'
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
      .select({
        id: people.id,
        name: people.name,
        givenName: people.givenName,
        familyName: people.familyName,
      })
      .from(people)
      .where(within(scoped(people, workspaceId), where))
      .orderBy(...orderBy)
      .limit(limit)
    const roles = await rolesOf(
      q,
      workspaceId,
      found.map((r) => r.id),
    )
    return found.map((r) => ({
      type: 'person',
      id: r.id,
      title: r.name,
      initials: avatarInitials(r),
      org:
        currentRole(
          (roles.get(r.id) ?? []).map((x) => ({ ...x, from: x.fromMonth, to: x.toMonth })),
        )?.organisationName ?? null,
    }))
  },
}
