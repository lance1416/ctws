import { desc } from 'drizzle-orm'
import { scoped, within } from '../../platform/db/scope'
import { countWhere, matching, wanted, type Linkable } from '../../shell/links'
import { lastMessageWith, nextFollowUpAbout } from './next'
import { communications } from './tables'

/** What a text is looked for in. */
const TEXT = ['communications.subject', 'communications.body']

export const communicationLinkable: Linkable = {
  type: 'communication',
  count: (q, workspaceId, text) =>
    countWhere(
      q,
      communications,
      within(scoped(communications, workspaceId), matching(TEXT, text)),
    ),
  rows: async (q, workspaceId, want) => {
    const { where, orderBy, limit, offset } = wanted(
      want,
      {
        id: communications.id,
        title: communications.subject,
        text: TEXT,
      },
      [desc(communications.occurredAt), desc(communications.id)],
    )
    const found = await q
      .select({
        id: communications.id,
        subject: communications.subject,
        direction: communications.direction,
        occurredAt: communications.occurredAt,
      })
      .from(communications)
      .where(within(scoped(communications, workspaceId), where))
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset)
    return found.map((r) => ({
      type: 'communication',
      id: r.id,
      title: r.subject ?? '(no subject)',
      direction: r.direction,
      occurredAt: r.occurredAt.toISOString(),
    }))
  },
  nextAbout: nextFollowUpAbout,
  lastAbout: lastMessageWith,
}
