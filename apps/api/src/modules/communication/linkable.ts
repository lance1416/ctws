import { desc } from 'drizzle-orm'
import { scoped, within } from '../../platform/db/scope'
import { wanted, type Linkable } from '../../shell/links'
import { communications } from './tables'

export const communicationLinkable: Linkable = {
  type: 'communication',
  rows: async (q, workspaceId, want) => {
    const { where, orderBy, limit } = wanted(
      want,
      {
        id: communications.id,
        title: communications.subject,
        text: ['communications.subject', 'communications.body'],
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
    return found.map((r) => ({
      type: 'communication',
      id: r.id,
      title: r.subject ?? '(no subject)',
      direction: r.direction,
      occurredAt: r.occurredAt.toISOString(),
    }))
  },
}
