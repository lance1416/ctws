import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { contacts } from '../db/schema'
import { textMatches } from '../db/like'
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
          text === '' ? undefined : textMatches(['contacts.name', 'contacts.org'], text),
        ),
      )
      .orderBy(asc(contacts.name), asc(contacts.id))
      .limit(limit)
    return rows.map((r) => ({ id: r.id, title: r.name, detail: r.org }))
  },
}
