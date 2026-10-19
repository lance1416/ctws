import { api, idFrom, type NoteResponse, objectType, type WorkspaceId } from '@ctws/contracts'
import type { FastifyRequest } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Queryable } from '../../platform/db/client'
import { on, serve } from '../../platform/http/serve'
import { actorOf, currentUser } from '../../shell/auth'
import type { LinkRegistry } from '../../shell/links'
import { getNote, listNotes, wordCount } from './queries'
import { createNote, deleteNote, updateNote } from './service'
import type { Note } from './tables'

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
    words: wordCount(n.body),
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  }))
}

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
  ])
}
