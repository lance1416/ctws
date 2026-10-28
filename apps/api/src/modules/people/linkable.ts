import { avatarInitials, currentRole } from '@ctws/core'
import { asc, sql, type SQL } from 'drizzle-orm'
import { textMatches } from '../../platform/db/sql'
import { scoped, within } from '../../platform/db/scope'
import { countWhere, wanted, type Linkable } from '../../shell/links'
import { rolesOf } from '../organisations'
import { people } from './tables'

/**
 * What a text finds a person by: their name, an alias they go by ("Wendy" finds 李雯, FR-024), or
 * a way to reach them; as the people module's own search reads it.
 */
const byText = (text: string): SQL | undefined =>
  text === ''
    ? undefined
    : sql`(
        ${textMatches(['people.name', 'people.org'], text)}
        or exists (
          select 1 from person_aliases al
          where al.person_id = people.id and ${textMatches(['al.name'], text)}
        )
        or exists (
          select 1 from person_channels ch
          where ch.person_id = people.id and ${textMatches(['ch.value'], text)}
        )
      )`

export const personLinkable: Linkable = {
  type: 'person',
  count: (q, workspaceId, text) =>
    countWhere(q, people, within(scoped(people, workspaceId), byText(text))),
  rows: async (q, workspaceId, want) => {
    const {
      where: byIds,
      orderBy,
      limit,
      offset,
    } = wanted(want, { id: people.id, title: people.name, text: ['people.name'] }, [
      asc(people.name),
      asc(people.id),
    ])
    const where = 'text' in want ? byText(want.text) : byIds
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
      .offset(offset)
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
