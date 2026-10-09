import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { contacts } from '../db/schema'
import { LIKE_ESCAPE, likePattern } from '../db/like'
import type { Linkable } from '../links/linkable'

/** 联系人 names its own people for the shell. See `links/linkable.ts` for why this exists. */
export const contactLinkable: Linkable = {
  type: 'contact',
  label: 'People',
  name: async (q, workspaceId, ids) => {
    const rows = await q
      .select({ id: contacts.id, name: contacts.name, org: contacts.org })
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, workspaceId),
          isNull(contacts.deletedAt),
          inArray(contacts.id, [...ids]),
        ),
      )
    return new Map(rows.map((r) => [r.id, { title: r.name, detail: r.org }]))
  },
  find: async (q, workspaceId, text, limit) => {
    const rows = await q
      .select({ id: contacts.id, name: contacts.name, org: contacts.org })
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, workspaceId),
          isNull(contacts.deletedAt),
          // The same shape the module's own search uses: `ilike … escape`, written as SQL
          // because drizzle's `ilike` has no escape clause and a bare `%` typed by a person
          // would otherwise match everything.
          text === ''
            ? undefined
            : sql`(contacts.name ilike ${likePattern(text)} escape ${LIKE_ESCAPE}
                   or contacts.org ilike ${likePattern(text)} escape ${LIKE_ESCAPE})`,
        ),
      )
      .orderBy(asc(contacts.name), asc(contacts.id))
      .limit(limit)
    return rows.map((r) => ({ id: r.id, title: r.name, detail: r.org }))
  },
}
