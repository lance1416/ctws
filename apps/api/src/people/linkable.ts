import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { people } from '../db/schema'
import { textMatches } from '../db/like'
import type { Linkable } from '../links/linkable'

/** People names its own people for the shell. See `links/linkable.ts` for why this exists. */
export const personLinkable: Linkable = {
  type: 'person',
  label: 'People',
  rows: async (q, workspaceId, want) => {
    const found = await q
      .select({ id: people.id, name: people.name, org: people.org })
      .from(people)
      .where(
        and(
          eq(people.workspaceId, workspaceId),
          isNull(people.deletedAt),
          'ids' in want
            ? inArray(people.id, [...want.ids])
            : want.text === ''
              ? undefined
              : textMatches(['people.name', 'people.org'], want.text),
        ),
      )
      .orderBy(asc(people.name), asc(people.id))
      .limit('ids' in want ? want.ids.length : want.limit)
    return found.map((r) => ({ id: r.id, title: r.name, detail: r.org }))
  },
}
