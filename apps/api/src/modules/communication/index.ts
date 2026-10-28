import type { TimelineEntry } from '@ctws/contracts'
import { inArray } from 'drizzle-orm'
import type { TimelineSource } from '../../shell/events'
import type { LinkRegistry } from '../../shell/links'
import { fixedModule } from '../../shell/module'
import { communicationLinkable } from './linkable'
import { partyNames } from './names'
import { communicationsWith } from './queries'
import { communicationRoutes } from './routes'
import { communications } from './tables'

/**
 * A message on another thing's timeline (FR-045, FR-065): what was said with it, or about its
 * project; with whom, by name, what was attached, and when a reply closed it.
 */
const messages = (registry: LinkRegistry): TimelineSource => ({
  kind: 'message',
  read: async (q, workspaceId, subject, span) => {
    if (
      subject.type !== 'person' &&
      subject.type !== 'organisation' &&
      subject.type !== 'project'
    ) {
      return []
    }
    const party = { type: subject.type, id: subject.id }
    const rows = await communicationsWith(q, workspaceId, party, span)
    const names = await partyNames(registry, q, workspaceId, rows)
    const replyIds = rows.flatMap((r) => (r.repliedBy ? [r.repliedBy] : []))
    const replies = new Map(
      replyIds.length === 0
        ? []
        : (
            await q
              .select({ id: communications.id, at: communications.occurredAt })
              .from(communications)
              .where(inArray(communications.id, replyIds))
          ).map((r) => [r.id as string, r.at]),
    )
    return rows.map((r): TimelineEntry => ({
      kind: 'message',
      at: r.occurredAt.toISOString(),
      message: {
        id: r.id,
        direction: r.direction,
        channel: r.channel,
        subject: r.subject,
        excerpt: r.body ? r.body.slice(0, 200) : null,
        parties: r.parties.flatMap((p) => {
          const name = names.get(`${p.type}:${p.id}`)
          return name === undefined ? [] : [{ ...p, name }]
        }),
        attachments: r.attachments,
        repliedBy: r.repliedBy,
        repliedAt: r.repliedBy ? (replies.get(r.repliedBy)?.toISOString() ?? null) : null,
      },
    }))
  },
})

export const communicationModule = fixedModule({
  id: 'communication',
  routes: communicationRoutes,
  linkable: communicationLinkable,
  timelineSources: (registry) => [messages(registry)],
})
