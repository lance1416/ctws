import {
  type CommunicationId,
  idFrom,
  IN_TOUCH_DAYS,
  type Party,
  projectId,
  type WorkspaceId,
} from '@ctws/contracts'
import { and, asc, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Queryable, Tx } from '../../platform/db/client'
import { NotFound } from '../../platform/errors'
import { type Page, type PageAsked, pageOf, spanOf } from '../../platform/db/page'
import { rowsOf } from '../../platform/db/raw'
import { scoped, within } from '../../platform/db/scope'
import { localDay } from '../../platform/db/time'
import { groupBy } from '../../platform/values'
import { projectScope } from '../../shell/projects'
import { type Communication, communicationParties, communications } from './tables'

export type CommunicationRow = Communication & { parties: Party[]; projectName: string | null }

/** Attaches the parties and the project's name to a page of rows, one query each. */
async function hydrate(
  q: Queryable,
  workspaceId: WorkspaceId,
  rows: Communication[],
): Promise<CommunicationRow[]> {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const parties = await q
    .select()
    .from(communicationParties)
    .where(inArray(communicationParties.communicationId, ids))
    .orderBy(asc(communicationParties.partyType), asc(communicationParties.partyId))
  const partiesOf = groupBy(
    parties,
    (p) => p.communicationId,
    (p): Party => ({ type: p.partyType, id: p.partyId }),
  )
  const projectIds = [...new Set(rows.flatMap((r) => (r.projectId ? [r.projectId] : [])))]
  const names = new Map<string, string>()
  if (projectIds.length > 0) {
    const result = await q.execute(sql`
      select p.id, p.name from projects p
      where ${projectScope(workspaceId, 'p')} and p.id in (${sql.join(
        projectIds.map((id) => sql`${id}`),
        sql`, `,
      )})
    `)
    for (const r of rowsOf(result, z.object({ id: z.string(), name: z.string() }))) {
      names.set(r.id, r.name)
    }
  }
  return rows.map((r) => ({
    ...r,
    parties: partiesOf.get(r.id) ?? [],
    projectName: r.projectId ? (names.get(r.projectId) ?? null) : null,
  }))
}

export async function getCommunication(
  q: Queryable,
  workspaceId: WorkspaceId,
  id: CommunicationId,
): Promise<CommunicationRow> {
  const [row] = await q
    .select()
    .from(communications)
    .where(within(scoped(communications, workspaceId), eq(communications.id, id)))
  if (!row) throw new NotFound('Communication')
  return (await hydrate(q, workspaceId, [row]))[0]!
}

export async function lockCommunication(
  tx: Tx,
  workspaceId: WorkspaceId,
  id: CommunicationId,
): Promise<Communication> {
  const [row] = await tx
    .select()
    .from(communications)
    .where(within(scoped(communications, workspaceId), eq(communications.id, id)))
    .for('update')
  if (!row) throw new NotFound('Communication')
  return row
}

/** Newest first: "Recent". */
export async function listCommunications(
  q: Queryable,
  workspaceId: WorkspaceId,
  asked: PageAsked,
): Promise<Page<CommunicationRow>> {
  const span = spanOf(asked)
  const rows = await q
    .select()
    .from(communications)
    .where(scoped(communications, workspaceId))
    .orderBy(desc(communications.occurredAt), desc(communications.id))
    .limit(span.limit)
    .offset(span.offset)
  const { rows: page, ...info } = pageOf(rows, asked)
  return { rows: await hydrate(q, workspaceId, page), ...info }
}

/** Sent ones still waiting, soonest follow-up first; `onOrBefore` keeps only those due by a day. */
export async function listAwaiting(
  q: Queryable,
  workspaceId: WorkspaceId,
  onOrBefore?: string,
): Promise<CommunicationRow[]> {
  const rows = await q
    .select()
    .from(communications)
    .where(
      within(
        scoped(communications, workspaceId),
        eq(communications.awaitingReply, true),
        isNull(communications.repliedBy),
        onOrBefore === undefined ? undefined : lte(communications.followUpOn, onOrBefore),
      ),
    )
    .orderBy(asc(communications.followUpOn), asc(communications.occurredAt), asc(communications.id))
  return hydrate(q, workspaceId, rows)
}

const inTouchRow = z.object({
  organisationId: z.string(),
  peopleCount: z.number(),
  lastId: z.string(),
  lastDirection: z.enum(['sent', 'received']),
  lastAt: z.string(),
  lastSubject: z.string().nullable(),
  followUpOn: z.string().nullable(),
  /** Days since the last sent with no reply, when nothing is waiting by a date. */
  unansweredDays: z.number().nullable(),
})
export type InTouchRow = z.output<typeof inTouchRow>

/**
 * Organisations with an exchange in the last 30 days (FR-071), latest first: the last exchange
 * with each (through the organisation itself or a person who holds a role there), how many of
 * its people were involved, and what is pending with it. One row per organisation however many
 * exchanges there were (FR-015).
 */
export async function organisationsInTouch(
  q: Queryable,
  workspaceId: WorkspaceId,
  timezone: string,
  now: Date,
): Promise<InTouchRow[]> {
  const today = localDay(now, timezone)
  const result = await q.execute(sql`
    with touched as (
      -- Every exchange, with the organisation it reaches: named directly, or through a person
      -- who currently holds a role there.
      select c.id, c.direction, c.occurred_at, c.subject, c.awaiting_reply, c.follow_up_on,
             c.replied_by, o.organisation_id,
             case when cp.party_type = 'person' then cp.party_id end as person_id
      from communications c
      join communication_parties cp on cp.communication_id = c.id
      join lateral (
        select cp.party_id as organisation_id where cp.party_type = 'organisation'
        union
        select r.organisation_id from person_roles r
        where cp.party_type = 'person' and r.person_id = cp.party_id and r.to_month is null
      ) o on true
      where ${scoped(communications, workspaceId, 'c')}
        and c.occurred_at >= (${today} - ${IN_TOUCH_DAYS}::int)::timestamp at time zone ${timezone}
    ),
    last as (
      select distinct on (organisation_id) organisation_id, id, direction, occurred_at, subject
      from touched order by organisation_id, occurred_at desc, id desc
    )
    select
      l.organisation_id as "organisationId",
      (select count(distinct person_id)::int from touched t where t.organisation_id = l.organisation_id and t.person_id is not null) as "peopleCount",
      l.id as "lastId",
      l.direction as "lastDirection",
      to_char(l.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "lastAt",
      l.subject as "lastSubject",
      (select min(t.follow_up_on)::text from touched t
        where t.organisation_id = l.organisation_id and t.awaiting_reply and t.replied_by is null) as "followUpOn",
      (select (${today} - min((t.occurred_at at time zone ${timezone})::date))::int from touched t
        where t.organisation_id = l.organisation_id and t.direction = 'sent' and t.replied_by is null
          and not t.awaiting_reply
          and not exists (
            select 1 from touched r
            where r.organisation_id = t.organisation_id and r.direction = 'received'
              and r.occurred_at > t.occurred_at
          )) as "unansweredDays"
    from last l
    order by l.occurred_at desc, l.id desc
  `)
  return rowsOf(result, inTouchRow)
}

/** The communications naming a person or organisation, newest first, for a timeline. */
export async function communicationsWith(
  q: Queryable,
  workspaceId: WorkspaceId,
  party: Party | { type: 'project'; id: string },
  { limit, before }: { limit: number; before: Date | null },
): Promise<CommunicationRow[]> {
  const upTo = before ? lte(communications.occurredAt, before) : undefined
  const rows =
    party.type === 'project'
      ? await q
          .select()
          .from(communications)
          .where(
            within(
              scoped(communications, workspaceId),
              and(eq(communications.projectId, idFrom(projectId, party.id)), upTo),
            ),
          )
          .orderBy(desc(communications.occurredAt), desc(communications.id))
          .limit(limit)
      : await q
          .select({ c: communications })
          .from(communications)
          .innerJoin(
            communicationParties,
            eq(communicationParties.communicationId, communications.id),
          )
          .where(
            within(
              scoped(communications, workspaceId),
              and(
                eq(communicationParties.partyType, party.type),
                eq(communicationParties.partyId, party.id),
                upTo,
              ),
            ),
          )
          .orderBy(desc(communications.occurredAt), desc(communications.id))
          .limit(limit)
          .then((rows) => rows.map((r) => r.c))
  return hydrate(q, workspaceId, rows)
}
