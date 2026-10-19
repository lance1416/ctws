import { desc, sql } from 'drizzle-orm'
import { scoped, within } from '../../platform/db/scope'
import { wanted, type Linkable } from '../../shell/links'
import { notes } from './tables'

export const noteLinkable: Linkable = {
  type: 'note',
  rows: async (q, workspaceId, want) => {
    const { where, orderBy, limit } = wanted(
      want,
      {
        id: notes.id,
        title: sql`coalesce(${notes.title}, left(${notes.body}, 80))`,
        text: ['notes.title', 'notes.body'],
      },
      [desc(notes.updatedAt), desc(notes.id)],
    )
    const found = await q
      .select({ id: notes.id, title: notes.title, body: notes.body })
      .from(notes)
      .where(within(scoped(notes, workspaceId), where))
      .orderBy(...orderBy)
      .limit(limit)
    return found.map((r) => ({
      type: 'note',
      id: r.id,
      // An untitled note is named by its first line.
      title: r.title ?? (r.body.split('\n')[0] ?? '').slice(0, 80) ?? '(empty note)',
    }))
  },
}
