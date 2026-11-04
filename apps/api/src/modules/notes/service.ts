import {
  type CreateNoteBody,
  EARLIER_DAYS,
  type NoteAnchor,
  type NoteId,
  noteId,
  type UpdateNoteBody,
  type WorkspaceId,
} from '@ctws/contracts'
import { asc, between, desc, eq, gte, lt } from 'drizzle-orm'
import type { Db, Queryable, Tx } from '../../platform/db/client'
import { addDays, openItems, tickItem, type OpenItem } from '@ctws/core'
import { newId } from '../../platform/db/ids'
import { DomainError, NotFound } from '../../platform/errors'
import { type Actor, scoped, within } from '../../platform/db/scope'
import { instantOf } from '../../platform/zone'
import { eventLog } from '../../shell/events'
import { bury } from '../../shell/tombstones'
import type { LinkRegistry } from '../../shell/links'
import { syncMentions } from '../../shell/relations'
import { folderOf } from './folders'
import { type Note, notes } from './tables'

const subject = (id: NoteId) => ({ type: 'note' as const, id })

/** A note hung on a thing goes where the thing is: no folder, no pin. */
class OnAThing extends DomainError {
  constructor() {
    super('conflict', { detail: 'A note on something goes where that thing is' })
  }
}

/**
 * The columns an anchor becomes, once the thing is known to be one this workspace can see. A note
 * on one occurrence of a meeting takes that occurrence's instant as the day it is about;
 * the meeting's module says which zone the occurrence's local time is in.
 */
async function anchorColumns(
  registry: LinkRegistry,
  tx: Tx,
  ctx: Actor,
  anchor: NoteAnchor | null | undefined,
): Promise<Pick<Note, 'anchorType' | 'anchorId' | 'occurrenceId' | 'heldAt'>> {
  if (!anchor) return { anchorType: null, anchorId: null, occurrenceId: null, heldAt: null }
  const [thing] = await registry
    .of(anchor.type)
    .rows(tx, ctx.workspaceId, { ids: [anchor.id], limit: 1 })
  if (!thing) throw new NotFound('Object')
  const occurrenceId = anchor.occurrenceId ?? null
  const heldAt =
    occurrenceId !== null && thing.type === 'meeting'
      ? instantOf(occurrenceId, thing.timeZone)
      : null
  return { anchorType: anchor.type, anchorId: anchor.id, occurrenceId, heldAt }
}

export async function createNote(
  registry: LinkRegistry,
  db: Db,
  ctx: Actor,
  body: CreateNoteBody,
): Promise<Note> {
  return db.transaction(async (tx) => {
    const anchored = await anchorColumns(registry, tx, ctx, body.anchor)
    // Made in a folder, from the folder's own New note: a note on a thing has none.
    const folderId = body.folderId ?? null
    if (folderId !== null) {
      if (body.anchor) throw new OnAThing()
      await folderOf(tx, ctx.workspaceId, folderId)
    }
    const [row] = await tx
      .insert(notes)
      .values({
        id: newId(noteId),
        workspaceId: ctx.workspaceId,
        title: body.title ?? null,
        body: body.body,
        ...anchored,
        folderId,
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
      const next = await anchorColumns(registry, tx, ctx, patch.anchor)
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
    // Where it is kept, not what it says: no edit, so its edited time stays.
    const shelf: Partial<Note> = {}
    const anchored = ('anchorType' in set ? set.anchorType : row.anchorType) !== null
    if (patch.folderId !== undefined && patch.folderId !== row.folderId) {
      if (patch.folderId !== null) {
        if (anchored) throw new OnAThing()
        await folderOf(tx, ctx.workspaceId, patch.folderId)
      }
      shelf.folderId = patch.folderId
    }
    if (patch.pinned !== undefined && patch.pinned !== (row.pinnedAt !== null)) {
      if (patch.pinned && anchored) throw new OnAThing()
      shelf.pinnedAt = patch.pinned ? ctx.now : null
    }
    // Hung on a thing now: it leaves its folder and its pin.
    if (anchored && row.anchorType === null)
      Object.assign(shelf, { folderId: null, pinnedAt: null })
    if (Object.keys(set).length === 0 && Object.keys(shelf).length === 0) return row
    const [updated] = await tx
      .update(notes)
      .set({ ...shelf, ...set, ...(Object.keys(set).length > 0 ? { updatedAt: ctx.now } : {}) })
      .where(eq(notes.id, id))
      .returning()
    if (set.body !== undefined) await syncMentions(tx, ctx, subject(id), 'body', set.body)
    return updated!
  })
}

/** Deletes a note for good: a tombstone that says what it hung on, and the row goes. */
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

/** A day's note, if one was written. */
export async function dayNote(q: Queryable, workspaceId: WorkspaceId, day: string) {
  const [row] = await q
    .select()
    .from(notes)
    .where(within(scoped(notes, workspaceId), eq(notes.day, day)))
  return row ?? null
}

/**
 * Writes a day's note: the first words make it, later ones change it, and emptying it takes it
 * away, so a wrap-up left blank leaves no note behind.
 */
export async function putDayNote(
  registry: LinkRegistry,
  db: Db,
  ctx: Actor,
  day: string,
  body: string,
): Promise<Note | null> {
  const current = await dayNote(db, ctx.workspaceId, day)
  if (body.trim() === '') {
    if (current) await deleteNote(db, ctx, current.id)
    return null
  }
  if (current) return updateNote(registry, db, ctx, current.id, { body })
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(notes)
      .values({
        id: newId(noteId),
        workspaceId: ctx.workspaceId,
        title: null,
        body,
        day,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .returning()
    await eventLog(tx, ctx).append(subject(row!.id), 'created', { to: { title: null, day } })
    await syncMentions(tx, ctx, subject(row!.id), 'body', body)
    return row!
  })
}

/** The days with a note of their own between two days, both included. */
export async function dayNotesBetween(
  q: Queryable,
  workspaceId: WorkspaceId,
  from: string,
  to: string,
): Promise<Note[]> {
  return q
    .select()
    .from(notes)
    .where(within(scoped(notes, workspaceId), between(notes.day, from, to)))
    .orderBy(asc(notes.day))
}

/** The item to tick is not where it was read, nor anywhere it could only be. */
class ItemMovedError extends DomainError {
  constructor() {
    super('conflict', {
      type: 'urn:ctws:problem:note-item-moved',
      title: 'That item has changed since it was read.',
    })
  }
}

/**
 * What a meeting's earlier occurrences left unticked: the notes on the same series, on an
 * occurrence before this one and no more than 90 days before it, the latest first. An
 * occurrence id is its local start in the series' own zone, so they compare as text.
 */
export async function earlierItems(
  q: Queryable,
  workspaceId: WorkspaceId,
  meetingId: string,
  recurrenceId: string,
) {
  const floor = addDays(recurrenceId.slice(0, 10), -EARLIER_DAYS)
  const rows = await q
    .select()
    .from(notes)
    .where(
      within(
        scoped(notes, workspaceId),
        eq(notes.anchorType, 'meeting'),
        eq(notes.anchorId, meetingId),
        lt(notes.occurrenceId, recurrenceId),
        gte(notes.occurrenceId, floor),
      ),
    )
    .orderBy(desc(notes.occurrenceId), desc(notes.createdAt))
  return rows.flatMap((n) => {
    const items = openItems(n.body)
    return items.length > 0
      ? [{ noteId: n.id, recurrenceId: n.occurrenceId!, heldAt: n.heldAt, items }]
      : []
  })
}

/** Ticks one item of a note, as an edit of its body would; refused when it cannot be found. */
export async function tickNoteItem(
  registry: LinkRegistry,
  db: Db,
  ctx: Actor,
  id: NoteId,
  item: OpenItem,
): Promise<Note> {
  const [row] = await db
    .select({ body: notes.body })
    .from(notes)
    .where(within(scoped(notes, ctx.workspaceId), eq(notes.id, id)))
  if (!row) throw new NotFound('Note')
  const body = tickItem(row.body, item)
  if (body === null) throw new ItemMovedError()
  return updateNote(registry, db, ctx, id, { body })
}
