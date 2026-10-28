import type { TimelineEntry } from '@ctws/contracts'
import type { TimelineSource } from '../../shell/events'
import { fixedModule } from '../../shell/module'
import { noteLinkable } from './linkable'
import { notesOn, wordCount } from './queries'
import { noteRoutes } from './routes'
import { noteWeekCounts } from './weekCounts'

/** The notes hung on a thing, on its timeline (FR-045). */
const hung: TimelineSource = {
  kind: 'note',
  read: async (q, workspaceId, subject, span) => {
    const rows = await notesOn(q, workspaceId, subject, span)
    return rows.map((n): TimelineEntry => ({
      kind: 'note',
      // A meeting note is about the day it was held, whenever it was written (FR-050).
      at: (n.heldAt ?? n.createdAt).toISOString(),
      note: {
        id: n.id,
        title: n.title,
        excerpt: n.body.slice(0, 200),
        words: wordCount(n.body),
        occurrenceId: n.occurrenceId,
      },
    }))
  },
}

export const notesModule = fixedModule({
  id: 'notes',
  routes: noteRoutes,
  linkable: noteLinkable,
  timelineSources: () => [hung],
  weekCounts: noteWeekCounts,
})
