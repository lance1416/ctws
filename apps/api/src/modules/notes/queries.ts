import { NOTE_ANCHOR_TYPES, type NoteId, type ObjectType, type WorkspaceId } from '@ctws/contracts'
import { and, desc, eq, or, sql } from 'drizzle-orm'
import type { Queryable } from '../../platform/db/client'
import { NotFound } from '../../platform/errors'
import { keyedPageOf, keyedSpan, type Page, type PageAsked } from '../../platform/db/page'
import { scoped, within } from '../../platform/db/scope'
import { afterCursor, type TimelineSpan } from '../../shell/events'
import { type Note, notes } from './tables'

export async function getNote(q: Queryable, workspaceId: WorkspaceId, id: NoteId): Promise<Note> {
  const [row] = await q
    .select()
    .from(notes)
    .where(within(scoped(notes, workspaceId), eq(notes.id, id)))
  if (!row) throw new NotFound('Note')
  return row
}

/** Newest edited first; or only those hung on one thing. */
export async function listNotes(
  q: Queryable,
  workspaceId: WorkspaceId,
  anchor: { type: ObjectType; id: string } | undefined,
  asked: PageAsked,
): Promise<Page<Note>> {
  const span = keyedSpan(asked, { at: notes.updatedAt, id: notes.id })
  const rows = await q
    .select()
    .from(notes)
    .where(
      within(
        scoped(notes, workspaceId),
        and(
          anchor
            ? and(
                eq(notes.anchorType, anchor.type as (typeof NOTE_ANCHOR_TYPES)[number]),
                eq(notes.anchorId, anchor.id),
              )
            : undefined,
          span.after,
        ),
      ),
    )
    .orderBy(desc(notes.updatedAt), desc(notes.id))
    .limit(span.limit)
  return keyedPageOf(rows, asked, (r) => ({ at: r.updatedAt, id: r.id }))
}

/** The instant a note sits at on a timeline: the day it was about, else when it was written. */
const noteAt = sql`coalesce(${notes.heldAt}, ${notes.createdAt})`

/**
 * The notes hung on one thing, newest first, for its timeline; nothing for a kind notes skip. A
 * project's timeline also carries the notes of the meetings held under it (FR-050), read here by
 * the meeting's `project_id` since no module owns both.
 */
export async function notesOn(
  q: Queryable,
  workspaceId: WorkspaceId,
  anchor: { type: ObjectType; id: string },
  span: TimelineSpan,
): Promise<Note[]> {
  if (!(NOTE_ANCHOR_TYPES as readonly string[]).includes(anchor.type)) return []
  const hungHere = sql`(${notes.anchorType} = ${anchor.type} and ${notes.anchorId} = ${anchor.id})`
  const onItsMeetings =
    anchor.type === 'project'
      ? sql`(${notes.anchorType} = 'meeting' and ${notes.anchorId} in (
          select m.id from meetings m
          where m.project_id = ${anchor.id} and m.workspace_id = ${workspaceId} and m.deleted_at is null))`
      : undefined
  return q
    .select()
    .from(notes)
    .where(
      within(
        scoped(notes, workspaceId),
        onItsMeetings ? or(hungHere, onItsMeetings) : hungHere,
        afterCursor(span, 'note', { at: noteAt, id: notes.id }),
      ),
    )
    .orderBy(desc(noteAt), desc(notes.id))
    .limit(span.limit)
}

/**
 * Words in a body: runs of non-space that hold a letter or a digit, so Markdown's own marks
 * (`#`, `-`, `*`) are not words; a CJK character counts as a word of its own.
 */
export function wordCount(body: string): number {
  const cjk = (body.match(/[㐀-䶿一-鿿]/g) ?? []).length
  const latin = body
    .replace(/[㐀-䶿一-鿿]/g, ' ')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length
  return cjk + latin
}
