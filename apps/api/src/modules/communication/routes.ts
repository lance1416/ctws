import {
  api,
  type AwaitingRow,
  type CommunicationResponse,
  NO_REPLY_AFTER_DAYS,
  type OrganisationInTouch,
  type WorkspaceId,
} from '@ctws/contracts'
import { dayIn } from '@ctws/core'
import type { FastifyRequest } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Queryable } from '../../platform/db/client'
import { on, serve } from '../../platform/http/serve'
import { actorOf, currentUser } from '../../shell/auth'
import type { LinkRegistry } from '../../shell/links'
import { daysBetween } from './days'
import {
  type CommunicationRow,
  getCommunication,
  listAwaiting,
  listCommunications,
  organisationsInTouch,
} from './queries'
import { createCommunication, deleteCommunication, logReply, updateCommunication } from './service'

/** How many rows the overview's tables show before "All N" (FR-015). */
const OVERVIEW_ROWS = 5

/** Names every party of these rows through the registry, one lookup per kind. */
async function named(
  registry: LinkRegistry,
  q: Queryable,
  workspaceId: WorkspaceId,
  rows: readonly CommunicationRow[],
): Promise<CommunicationResponse[]> {
  const names = new Map<string, string>()
  for (const type of ['person', 'organisation'] as const) {
    const ids = [
      ...new Set(rows.flatMap((r) => r.parties.filter((p) => p.type === type).map((p) => p.id))),
    ]
    if (ids.length === 0) continue
    for (const thing of await registry.of(type).rows(q, workspaceId, { ids, limit: ids.length })) {
      names.set(`${type}:${thing.id}`, thing.title)
    }
  }
  return rows.map((r) => ({
    id: r.id,
    direction: r.direction,
    channel: r.channel,
    occurredAt: r.occurredAt.toISOString(),
    parties: r.parties
      .filter((p) => names.has(`${p.type}:${p.id}`))
      .map((p) => ({ ...p, name: names.get(`${p.type}:${p.id}`)! })),
    subject: r.subject,
    body: r.body,
    projectId: r.projectId,
    projectName: r.projectName,
    attachments: r.attachments,
    awaitingReply: r.awaitingReply,
    followUpOn: r.followUpOn,
    repliedBy: r.repliedBy,
    replyTo: r.replyTo,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }))
}

/** How a waiting message stands against today, on the account's calendar. */
const standing = (row: CommunicationResponse, today: string): AwaitingRow => ({
  ...row,
  waitingDays: daysBetween(row.occurredAt.slice(0, 10), today),
  daysToFollowUp: row.followUpOn === null ? null : daysBetween(today, row.followUpOn),
})

export const communicationRoutes: FastifyPluginAsyncZod<{ registry: LinkRegistry }> = async (
  app,
  { registry },
) => {
  const say = (req: FastifyRequest, rows: readonly CommunicationRow[]) =>
    named(registry, app.db, currentUser(req).workspaceId, rows)
  const today = (req: FastifyRequest) => dayIn(app.clock(), currentUser(req).timezone)

  serve(app, [
    on(api.communication.list, async (req) => {
      const { rows, page } = await listCommunications(
        app.db,
        currentUser(req).workspaceId,
        req.query,
      )
      return { communications: await say(req, rows), page }
    }),

    on(api.communication.awaiting, async (req) => {
      const rows = await listAwaiting(app.db, currentUser(req).workspaceId)
      return { awaiting: (await say(req, rows)).map((r) => standing(r, today(req))) }
    }),

    on(api.communication.followUps, async (req) => {
      const rows = await listAwaiting(app.db, currentUser(req).workspaceId, today(req))
      return { awaiting: (await say(req, rows)).map((r) => standing(r, today(req))) }
    }),

    on(api.communication.overview, async (req) => {
      const user = currentUser(req)
      const awaitingRows = await listAwaiting(app.db, user.workspaceId)
      const awaiting = (await say(req, awaitingRows.slice(0, OVERVIEW_ROWS))).map((r) =>
        standing(r, today(req)),
      )
      const touched = await organisationsInTouch(
        app.db,
        user.workspaceId,
        user.timezone,
        app.clock(),
      )
      const ids = touched.slice(0, OVERVIEW_ROWS).map((t) => t.organisationId)
      const orgs = new Map(
        ids.length === 0
          ? []
          : (
              await registry
                .of('organisation')
                .rows(app.db, user.workspaceId, { ids, limit: ids.length })
            ).map((o) => [o.id, o.title]),
      )
      // Only organisations that can still be seen count, before the table is cut to its rows.
      const seen = touched.filter((t) => orgs.has(t.organisationId))
      const inTouch: OrganisationInTouch[] = seen.slice(0, OVERVIEW_ROWS).map((t) => ({
        organisationId: t.organisationId as OrganisationInTouch['organisationId'],
        organisationName: orgs.get(t.organisationId)!,
        peopleCount: t.peopleCount,
        lastContact: {
          communicationId: t.lastId as OrganisationInTouch['lastContact']['communicationId'],
          direction: t.lastDirection,
          occurredAt: t.lastAt,
          subject: t.lastSubject,
        },
        next:
          t.followUpOn !== null
            ? { kind: 'follow-up', on: t.followUpOn, late: t.followUpOn < today(req) }
            : t.unansweredDays !== null && t.unansweredDays >= NO_REPLY_AFTER_DAYS
              ? { kind: 'no-reply', days: t.unansweredDays }
              : { kind: 'nothing' },
      }))
      return { awaiting, awaitingTotal: awaitingRows.length, inTouch, inTouchTotal: seen.length }
    }),

    on(
      api.communication.get,
      async (req) =>
        (
          await say(req, [
            await getCommunication(app.db, currentUser(req).workspaceId, req.params.id),
          ])
        )[0]!,
    ),

    on(api.communication.create, async (req) => {
      const user = currentUser(req)
      const row = await createCommunication(registry, app.db, actorOf(req), user.timezone, req.body)
      return (await say(req, [row]))[0]!
    }),

    on(api.communication.update, async (req) => {
      const user = currentUser(req)
      const row = await updateCommunication(
        registry,
        app.db,
        actorOf(req),
        user.timezone,
        req.params.id,
        req.body,
      )
      return (await say(req, [row]))[0]!
    }),

    on(api.communication.reply, async (req) => {
      const row = await logReply(app.db, actorOf(req), req.params.id, req.body)
      return (await say(req, [row]))[0]!
    }),

    on(api.communication.remove, async (req) => {
      await deleteCommunication(app.db, actorOf(req), req.params.id)
    }),
  ])
}
