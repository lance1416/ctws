import { api, type CalendarEntry, type LinkCandidate, type WorkspaceId } from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Queryable } from '../../platform/db/client'
import { NotFound } from '../../platform/errors'
import { on, serve } from '../../platform/http/serve'
import { actorOf, currentUser, todayOf } from '../auth/authenticated'
import { exists } from '../links/read'
import type { LinkRegistry } from '../links/registry'
import {
  dismissReminder,
  reminderOf,
  remindersBetween,
  remindersDue,
  setReminder,
  type ReminderRow,
} from './store'

type Named = { row: ReminderRow; object: LinkCandidate }

/**
 * The things the reminders are on, named as links to them are, one batch a kind. A reminder whose
 * thing the workspace no longer sees is left out: it went with the thing, or is about to.
 */
async function named(
  registry: LinkRegistry,
  q: Queryable,
  workspaceId: WorkspaceId,
  rows: readonly ReminderRow[],
): Promise<Named[]> {
  const kinds = [...new Set(rows.map((r) => r.objectType))]
  const found = new Map<string, LinkCandidate>()
  for (const type of kinds) {
    const ids = rows.filter((r) => r.objectType === type).map((r) => r.objectId)
    const things = await registry.of(type).rows(q, workspaceId, { ids, limit: ids.length })
    for (const t of things) found.set(`${type}:${t.id}`, t)
  }
  return rows.flatMap((row) => {
    const object = found.get(`${row.objectType}:${row.objectId}`)
    return object ? [{ row, object }] : []
  })
}

const toResponse = ({ row, object }: Named) => ({
  object,
  onDay: row.onDay,
  why: row.why,
  createdAt: row.createdAt.toISOString(),
})

const toCalendarEntry = ({ row, object }: Named): CalendarEntry => ({
  type: row.objectType,
  id: row.objectId,
  kind: 'reminder',
  recurrenceId: null,
  day: row.onDay,
  title: object.title,
  startsAt: null,
  endsAt: null,
  timeZone: null,
  turns: null,
  joinUrl: null,
  done: false,
  repeats: false,
  projectId: null,
  projectName: null,
})

/** Reminders hang on any kind of thing, so the shell owns them; the thing's module names it. */
export const reminderRoutes: FastifyPluginAsyncZod<{ registry: LinkRegistry }> = async (
  app,
  { registry },
) => {
  serve(app, [
    on(api.reminders.due, async (req) => {
      const { workspaceId } = currentUser(req)
      const rows = await remindersDue(app.db, workspaceId, todayOf(req))
      return { reminders: (await named(registry, app.db, workspaceId, rows)).map(toResponse) }
    }),

    on(api.reminders.calendar, async (req) => {
      const { workspaceId } = currentUser(req)
      const rows = await remindersBetween(app.db, workspaceId, req.query.from, req.query.to)
      return { entries: (await named(registry, app.db, workspaceId, rows)).map(toCalendarEntry) }
    }),

    on(api.reminders.of, async (req) => {
      const { workspaceId } = currentUser(req)
      if (!(await exists(registry, app.db, workspaceId, req.params))) throw new NotFound('Object')
      const row = await reminderOf(app.db, workspaceId, req.params)
      const [one] = row ? await named(registry, app.db, workspaceId, [row]) : []
      return { reminder: one ? toResponse(one) : null }
    }),

    on(api.reminders.set, async (req) => {
      const ctx = actorOf(req)
      const done = await app.db.transaction(async (tx) => {
        if (!(await exists(registry, tx, ctx.workspaceId, req.params))) throw new NotFound('Object')
        const row = await setReminder(tx, ctx, req.params, {
          onDay: req.body.onDay,
          why: req.body.why ?? null,
        })
        return named(registry, tx, ctx.workspaceId, [row])
      })
      return toResponse(done[0]!)
    }),

    on(api.reminders.dismiss, async (req) => {
      await dismissReminder(app.db, currentUser(req).workspaceId, req.params)
    }),
  ])
}
