import type { TimelineEntry } from '@ctws/contracts'
import { fixedModule, type ApiModule } from '../../shell/module'
import { noteLinkable } from './linkable'
import { notesOn, wordCount } from './queries'
import { noteRoutes } from './routes'

/** The notes hung on a thing, on its timeline (FR-045). */
const hung: NonNullable<ApiModule['timelineSources']>[number] = {
  kind: 'note',
  read: async (q, workspaceId, subject, span) => {
    const rows = await notesOn(q, workspaceId, subject, span)
    return rows.map((n): TimelineEntry => ({
      kind: 'note',
      at: n.createdAt.toISOString(),
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
  timelineSources: [hung],
})
