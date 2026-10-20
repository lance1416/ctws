import { api, type MigrationReportResponse } from '@ctws/contracts'
import { eq } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { NotFound } from '../../platform/errors'
import { on, serve } from '../../platform/http/serve'
import { actorOf, currentUser } from '../auth/authenticated'
import { migrationReports } from './tables'

const toResponse = (r: typeof migrationReports.$inferSelect): MigrationReportResponse => ({
  ranAt: r.ranAt.toISOString(),
  backupRef: { name: r.backupRef, bytes: Number(r.backupBytes) },
  counts: r.counts,
  items: r.items,
  pending: r.items.filter((i) => i.attention && !i.checked).length,
  doneAt: r.doneAt?.toISOString() ?? null,
})

/** The report of this workspace's move (FR-099); 404 until a move has happened. */
export const migrationRoutes: FastifyPluginAsyncZod = async (app) => {
  const reportOf = async (workspaceId: (typeof migrationReports.$inferSelect)['workspaceId']) => {
    const [row] = await app.db
      .select()
      .from(migrationReports)
      .where(eq(migrationReports.workspaceId, workspaceId))
    if (!row) throw new NotFound('Migration report')
    return row
  }

  serve(app, [
    on(api.migration.get, async (req) => toResponse(await reportOf(currentUser(req).workspaceId))),

    on(api.migration.check, async (req) => {
      const { workspaceId } = actorOf(req)
      const row = await reportOf(workspaceId)
      if (!row.items.some((i) => i.key === req.params.key)) throw new NotFound('Item')
      const items = row.items.map((i) =>
        i.key === req.params.key ? { ...i, checked: req.body.checked } : i,
      )
      const [updated] = await app.db
        .update(migrationReports)
        .set({ items })
        .where(eq(migrationReports.workspaceId, workspaceId))
        .returning()
      return toResponse(updated!)
    }),

    on(api.migration.done, async (req) => {
      const { workspaceId, now } = actorOf(req)
      await reportOf(workspaceId)
      const [updated] = await app.db
        .update(migrationReports)
        .set({ doneAt: now })
        .where(eq(migrationReports.workspaceId, workspaceId))
        .returning()
      return toResponse(updated!)
    }),
  ])
}
