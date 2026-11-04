import { eventLog } from '../../shell/events'
import { textSourceOf } from '../../shell/unlinked'
import { notes } from './tables'
import type { TimelineEntry } from '@ctws/contracts'
import type { TimelineSource } from '../../shell/events'
import { fixedModule } from '../../shell/module'
import { noteLinkable } from './linkable'
import { notesOn, wordCount } from './queries'
import { noteRoutes } from './routes'
import { noteWeekCounts } from './weekCounts'

/** The notes hung on a thing, on its timeline. */
const hung: TimelineSource = {
  kind: 'note',
  read: async (q, workspaceId, subject, span) => {
    const rows = await notesOn(q, workspaceId, subject, span)
    return rows.map((n): TimelineEntry => ({
      kind: 'note',
      // A meeting note is about the day it was held, whenever it was written.
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
  texts: textSourceOf({
    type: 'note',
    table: notes,
    id: notes.id,
    workspace: notes.workspaceId,
    text: notes.body,
    field: 'body',
    updated: notes.updatedAt,
    log: (tx, ctx, id) => eventLog(tx, ctx).append({ type: 'note', id }, 'edited', {}),
  }),
})
