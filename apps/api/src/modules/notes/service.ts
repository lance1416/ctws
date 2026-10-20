import {
  type CreateNoteBody,
  type NoteAnchor,
  type NoteId,
  noteId,
  type UpdateNoteBody,
} from '@ctws/contracts'
import { eq } from 'drizzle-orm'
import type { Db, Tx } from '../../platform/db/client'
import { newId } from '../../platform/db/ids'
import { NotFound } from '../../platform/errors'
import { type Actor, scoped, within } from '../../platform/db/scope'
import { eventLog } from '../../shell/events'
import { bury } from '../../shell/tombstones'
import type { LinkRegistry } from '../../shell/links'
import { syncMentions } from '../../shell/relations'
import { type Note, notes } from './tables'

const subject = (id: NoteId) => ({ type: 'note' as const, id })

/** The thing a note hangs on is one this workspace can see. */
async function assertAnchorVisible(
  registry: LinkRegistry,
  tx: Tx,
  ctx: Actor,
  anchor: NoteAnchor | null | undefined,
): Promise<void> {
  if (!anchor) return
  const rows = await registry
    .of(anchor.type)
    .rows(tx, ctx.workspaceId, { ids: [anchor.id], limit: 1 })
  if (rows.length === 0) throw new NotFound('Object')
}

const anchorColumns = (anchor: NoteAnchor | null) => ({
  anchorType: anchor?.type ?? null,
  anchorId: anchor?.id ?? null,
  occurrenceId: anchor?.occurrenceId ?? null,
})

export async function createNote(
  registry: LinkRegistry,
  db: Db,
  ctx: Actor,
  body: CreateNoteBody,
): Promise<Note> {
  return db.transaction(async (tx) => {
    await assertAnchorVisible(registry, tx, ctx, body.anchor)
    const [row] = await tx
      .insert(notes)
      .values({
        id: newId(noteId),
        workspaceId: ctx.workspaceId,
        title: body.title ?? null,
        body: body.body,
        ...anchorColumns(body.anchor ?? null),
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .returning()
    await eventLog(tx, ctx).append(subject(row!.id), 'created', {
      to: { title: row!.title, anchor: body.anchor ?? null },
    })
    await syncMentions(tx, ctx, subject(row!.id), 'body', row!.body)
    return row!
  })
}

/**
 * Patches a note. The body is autosaved, so a body change is logged once as `edited` with no old
 * value rather than as a diff per keystroke; a title or anchor change is logged with both values.
 */
export async function updateNote(
  registry: LinkRegistry,
  db: Db,
  ctx: Actor,
  id: NoteId,
  patch: UpdateNoteBody,
): Promise<Note> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(notes)
      .where(within(scoped(notes, ctx.workspaceId), eq(notes.id, id)))
      .for('update')
    if (!row) throw new NotFound('Note')
    if (patch.anchor !== undefined) await assertAnchorVisible(registry, tx, ctx, patch.anchor)
    const log = eventLog(tx, ctx)
    const set: Partial<Note> = {}
    if (patch.title !== undefined && patch.title !== row.title) {
      set.title = patch.title
      await log.append(subject(id), 'field_changed', {
        field: 'title',
        from: row.title,
        to: patch.title,
      })
    }
    if (patch.anchor !== undefined) {
      const next = anchorColumns(patch.anchor)
      if (
        next.anchorType !== row.anchorType ||
        next.anchorId !== row.anchorId ||
        next.occurrenceId !== row.occurrenceId
      ) {
        Object.assign(set, next)
        await log.append(subject(id), 'field_changed', {
          field: 'anchor',
          from: row.anchorType ? { type: row.anchorType, id: row.anchorId } : null,
          to: patch.anchor,
        })
      }
    }
    if (patch.body !== undefined && patch.body !== row.body) {
      set.body = patch.body
      await log.append(subject(id), 'edited', {})
    }
    if (Object.keys(set).length === 0) return row
    const [updated] = await tx
      .update(notes)
      .set({ ...set, updatedAt: ctx.now })
      .where(eq(notes.id, id))
      .returning()
    if (set.body !== undefined) await syncMentions(tx, ctx, subject(id), 'body', set.body)
    return updated!
  })
}

/** Deletes a note for good (FR-035): a tombstone that says what it hung on, and the row goes. */
export async function deleteNote(db: Db, ctx: Actor, id: NoteId): Promise<void> {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(notes)
      .where(within(scoped(notes, ctx.workspaceId), eq(notes.id, id)))
      .for('update')
    if (!current) throw new NotFound('Note')
    await bury(tx, ctx, [
      {
        type: 'note',
        id,
        title: current.title ?? current.body.split('\n')[0]!.slice(0, 80),
        place: { parentType: current.anchorType, parentId: current.anchorId },
      },
    ])
    await tx.delete(notes).where(eq(notes.id, id))
  })
}
