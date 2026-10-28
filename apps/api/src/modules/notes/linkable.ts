import { desc, sql } from 'drizzle-orm'
import { scoped, within } from '../../platform/db/scope'
import { countWhere, matching, wanted, type Linkable } from '../../shell/links'
import { notes } from './tables'

/** What a text is looked for in. */
const TEXT = ['notes.title', 'notes.body']

export const noteLinkable: Linkable = {
  type: 'note',
  count: (q, workspaceId, text) =>
    countWhere(q, notes, within(scoped(notes, workspaceId), matching(TEXT, text))),
  rows: async (q, workspaceId, want) => {
    const { where, orderBy, limit, offset } = wanted(
      want,
      {
        id: notes.id,
        title: sql`coalesce(${notes.title}, left(${notes.body}, 80))`,
        text: TEXT,
      },
      [desc(notes.updatedAt), desc(notes.id)],
    )
    const found = await q
      .select({ id: notes.id, title: notes.title, body: notes.body })
      .from(notes)
      .where(within(scoped(notes, workspaceId), where))
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset)
    return found.map((r) => ({
      type: 'note',
      id: r.id,
      // An untitled note is named by its first line.
      title: r.title ?? (r.body.split('\n')[0] ?? '').slice(0, 80) ?? '(empty note)',
    }))
  },
}
