import { and, eq, inArray, isNull } from 'drizzle-orm'
import { contacts } from '../db/schema'
import type { Linkable } from '../links/linkable'

/** 联系人 names its own people for the shell. See `links/linkable.ts` for why this exists. */
export const contactLinkable: Linkable = {
  type: 'contact',
  label: '人',
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
}
