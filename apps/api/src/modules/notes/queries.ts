import { NOTE_ANCHOR_TYPES, type NoteId, type ObjectType, type WorkspaceId } from '@ctws/contracts'
import { and, desc, eq, lte } from 'drizzle-orm'
import type { Queryable } from '../../platform/db/client'
import { NotFound } from '../../platform/errors'
import { type Page, type PageAsked, pageOf, spanOf } from '../../platform/db/page'
import { scoped, within } from '../../platform/db/scope'
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
  const span = spanOf(asked)
  const rows = await q
    .select()
    .from(notes)
    .where(
      within(
        scoped(notes, workspaceId),
        anchor
          ? and(
              eq(notes.anchorType, anchor.type as (typeof NOTE_ANCHOR_TYPES)[number]),
              eq(notes.anchorId, anchor.id),
            )
          : undefined,
      ),
    )
    .orderBy(desc(notes.updatedAt), desc(notes.id))
    .limit(span.limit)
    .offset(span.offset)
  return pageOf(rows, asked)
}

/** The notes hung on one thing, newest first, for its timeline; nothing for a kind notes skip. */
export async function notesOn(
  q: Queryable,
  workspaceId: WorkspaceId,
  anchor: { type: ObjectType; id: string },
  { limit, before }: { limit: number; before: Date | null },
): Promise<Note[]> {
  if (!(NOTE_ANCHOR_TYPES as readonly string[]).includes(anchor.type)) return []
  return q
    .select()
    .from(notes)
    .where(
      within(
        scoped(notes, workspaceId),
        and(
          eq(notes.anchorType, anchor.type as (typeof NOTE_ANCHOR_TYPES)[number]),
          eq(notes.anchorId, anchor.id),
          before ? lte(notes.createdAt, before) : undefined,
        ),
      ),
    )
    .orderBy(desc(notes.createdAt), desc(notes.id))
    .limit(limit)
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
