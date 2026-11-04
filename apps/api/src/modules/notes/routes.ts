import { api, idFrom, type NoteResponse, objectType, type WorkspaceId } from '@ctws/contracts'
import type { FastifyRequest } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Queryable } from '../../platform/db/client'
import { on, serve } from '../../platform/http/serve'
import { actorOf, currentUser } from '../../shell/auth'
import type { LinkRegistry } from '../../shell/links'
import { getNote, listNotes, wordCount } from './queries'
import { createFolder, deleteFolder, listFolders, updateFolder } from './folders'
import { createNote, dayNote, dayNotesBetween, deleteNote, putDayNote, updateNote } from './service'
import type { Note, NoteFolder } from './tables'

/** Names each note's anchor through the registry, one lookup per kind. */
async function respond(
  registry: LinkRegistry,
  q: Queryable,
  workspaceId: WorkspaceId,
  rows: readonly Note[],
): Promise<NoteResponse[]> {
  const names = new Map<string, string>()
  for (const type of objectType.options) {
    const ids = [
      ...new Set(rows.flatMap((n) => (n.anchorType === type && n.anchorId ? [n.anchorId] : []))),
    ]
    if (ids.length === 0) continue
    for (const thing of await registry.of(type).rows(q, workspaceId, { ids, limit: ids.length })) {
      names.set(`${type}:${thing.id}`, thing.title)
    }
  }
  return rows.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    anchor:
      n.anchorType && n.anchorId
        ? {
            type: n.anchorType,
            id: n.anchorId,
            occurrenceId: n.occurrenceId,
            title: names.get(`${n.anchorType}:${n.anchorId}`) ?? null,
          }
        : null,
    folderId: n.folderId,
    pinnedAt: n.pinnedAt?.toISOString() ?? null,
    words: wordCount(n.body),
    heldAt: n.heldAt?.toISOString() ?? null,
    day: n.day,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  }))
}

const folderShown = (f: NoteFolder) => ({
  id: f.id,
  parentId: f.parentId,
  name: f.name,
  open: f.open,
  createdAt: f.createdAt.toISOString(),
  updatedAt: f.updatedAt.toISOString(),
})

export const noteRoutes: FastifyPluginAsyncZod<{ registry: LinkRegistry }> = async (
  app,
  { registry },
) => {
  const say = async (req: FastifyRequest, row: Note) =>
    (await respond(registry, app.db, currentUser(req).workspaceId, [row]))[0]!
  serve(app, [
    on(api.notes.list, async (req) => {
      const { workspaceId } = currentUser(req)
      const { anchor, ...asked } = req.query
      const parsed = anchor
        ? {
            type: objectType.parse(anchor.split(':')[0]),
            id: idFrom(objectType, anchor.split(':')[1]!),
          }
        : undefined
      const { rows, page } = await listNotes(app.db, workspaceId, parsed, asked)
      return { notes: await respond(registry, app.db, workspaceId, rows), page }
    }),

    on(api.notes.get, async (req) =>
      say(req, await getNote(app.db, currentUser(req).workspaceId, req.params.id)),
    ),

    on(api.notes.create, async (req) =>
      say(req, await createNote(registry, app.db, actorOf(req), req.body)),
    ),

    on(api.notes.update, async (req) =>
      say(req, await updateNote(registry, app.db, actorOf(req), req.params.id, req.body)),
    ),

    on(api.notes.remove, async (req) => {
      await deleteNote(app.db, actorOf(req), req.params.id)
    }),

    on(api.notes.day, async (req) => {
      const { workspaceId } = currentUser(req)
      const row = await dayNote(app.db, workspaceId, req.params.day)
      return { note: row ? (await respond(registry, app.db, workspaceId, [row]))[0]! : null }
    }),

    on(api.notes.putDay, async (req) => {
      const ctx = actorOf(req)
      const row = await putDayNote(registry, app.db, ctx, req.params.day, req.body.body)
      return { note: row ? (await respond(registry, app.db, ctx.workspaceId, [row]))[0]! : null }
    }),

    on(api.notes.calendar, async (req) => {
      const { workspaceId } = currentUser(req)
      const rows = await dayNotesBetween(app.db, workspaceId, req.query.from, req.query.to)
      return {
        entries: rows.map((n) => ({
          type: 'note' as const,
          id: n.id,
          kind: 'day-note' as const,
          recurrenceId: null,
          day: n.day!,
          title: n.day!,
          startsAt: null,
          endsAt: null,
          timeZone: null,
          turns: null,
          joinUrl: null,
          done: false,
          repeats: false,
          projectId: null,
          projectName: null,
        })),
      }
    }),

    on(api.noteFolders.list, async (req) => ({
      folders: (await listFolders(app.db, currentUser(req).workspaceId)).map(folderShown),
    })),

    on(api.noteFolders.create, async (req) =>
      folderShown(await createFolder(app.db, actorOf(req), req.body)),
    ),

    on(api.noteFolders.update, async (req) =>
      folderShown(await updateFolder(app.db, actorOf(req), req.params.id, req.body)),
    ),

    on(api.noteFolders.remove, async (req) => {
      await deleteFolder(app.db, actorOf(req), req.params.id)
    }),
  ])
}
