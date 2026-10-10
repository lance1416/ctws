import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { contacts } from '../db/schema'
import { textMatches } from '../db/like'
import type { Linkable } from '../links/linkable'

/** Contacts names its own people for the shell. See `links/linkable.ts` for why this exists. */
export const contactLinkable: Linkable = {
  type: 'contact',
  label: 'People',
  rows: async (q, workspaceId, want) => {
    const found = await q
      .select({ id: contacts.id, name: contacts.name, org: contacts.org })
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, workspaceId),
          isNull(contacts.deletedAt),
          'ids' in want
            ? inArray(contacts.id, [...want.ids])
            : want.text === ''
              ? undefined
              : textMatches(['contacts.name', 'contacts.org'], want.text),
        ),
      )
      .orderBy(asc(contacts.name), asc(contacts.id))
      .limit('ids' in want ? want.ids.length : want.limit)
    return found.map((r) => ({ id: r.id, title: r.name, detail: r.org }))
  },
}
