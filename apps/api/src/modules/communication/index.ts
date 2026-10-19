import type { TimelineEntry } from '@ctws/contracts'
import { fixedModule, type ApiModule } from '../../shell/module'
import { communicationLinkable } from './linkable'
import { communicationsWith } from './queries'
import { communicationRoutes } from './routes'

/** A message on another thing's timeline (FR-045): what was said with it, or about its project. */
const messages: NonNullable<ApiModule['timelineSources']>[number] = {
  kind: 'message',
  read: async (q, workspaceId, subject, limit) => {
    if (
      subject.type !== 'person' &&
      subject.type !== 'organisation' &&
      subject.type !== 'project'
    ) {
      return []
    }
    const party = { type: subject.type, id: subject.id }
    const rows = await communicationsWith(q, workspaceId, party, limit)
    return rows.map((r): TimelineEntry => ({
      kind: 'message',
      at: r.occurredAt.toISOString(),
      message: {
        id: r.id,
        direction: r.direction,
        channel: r.channel,
        subject: r.subject,
        excerpt: r.body ? r.body.slice(0, 200) : null,
        parties: r.parties,
        repliedBy: r.repliedBy,
      },
    }))
  },
}

export const communicationModule = fixedModule({
  id: 'communication',
  routes: communicationRoutes,
  linkable: communicationLinkable,
  timelineSources: [messages],
})
