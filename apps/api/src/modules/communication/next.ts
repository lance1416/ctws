import {
  communicationId,
  type LastExchange,
  type NextAbout,
  type ObjectType,
  type WorkspaceId,
} from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Queryable } from '../../platform/db/client'
import { rowsOf } from '../../platform/db/raw'
import { scoped } from '../../platform/db/scope'
import type { NextAt } from '../../shell/links'
import { communications } from './tables'

/**
 * The soonest follow-up about each thing (FR-058): of the sent messages still awaiting a reply, the
 * earliest follow-up day among those related to it or, for an organisation, sent to it, wherever
 * they are filed; or those filed under the project asked from and sent to someone who holds a role
 * there now, as "Organisations in touch" counts them (FR-071). One whose day has passed is still
 * the soonest.
 */
export async function nextFollowUpAbout(
  q: Queryable,
  workspaceId: WorkspaceId,
  about: readonly { type: ObjectType; id: string }[],
  { projectId }: NextAt,
): Promise<Map<string, NextAbout>> {
  const out = new Map<string, NextAbout>()
  const ids = [...new Set(about.map((a) => a.id))]
  if (ids.length === 0) return out
  const wanted = sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )
  const rows = rowsOf(
    await q.execute(sql`
      select distinct on (s.id) s.id::text as "subjectId", c.id::text as "id",
             c.follow_up_on::text as "on"
      from communications c
      join lateral (
        select cp.party_id as id from communication_parties cp
        where cp.communication_id = c.id and cp.party_type = 'organisation'
        union
        select r.organisation_id from communication_parties cp
        join person_roles r on r.person_id = cp.party_id and r.to_month is null
        where cp.communication_id = c.id and cp.party_type = 'person'
          and c.project_id = ${projectId}
        union
        select x.to_id from relations x where x.from_type = 'communication' and x.from_id = c.id
        union
        select x.from_id from relations x where x.to_type = 'communication' and x.to_id = c.id
      ) s on true
      where ${scoped(communications, workspaceId, 'c')}
        and c.awaiting_reply and c.replied_by is null and c.follow_up_on is not null
        and s.id in (${wanted})
      order by s.id, c.follow_up_on, c.occurred_at, c.id`),
    z.object({ subjectId: z.string(), id: communicationId, on: z.string() }),
  )
  for (const r of rows) out.set(r.subjectId, { followUp: { id: r.id, on: r.on } })
  return out
}

/**
 * The last message with each of these people (FR-060): the latest, sent or received by `now`, that
 * names them as a party or is related to them outright.
 */
export async function lastMessageWith(
  q: Queryable,
  workspaceId: WorkspaceId,
  people: readonly string[],
  now: Date,
): Promise<Map<string, LastExchange>> {
  const out = new Map<string, LastExchange>()
  if (people.length === 0) return out
  const wanted = sql.join(
    people.map((id) => sql`${id}::uuid`),
    sql`, `,
  )
  const rows = rowsOf(
    await q.execute(sql`
      select distinct on (s.id) s.id::text as "personId", c.direction as kind, c.occurred_at as at
      from communications c
      join lateral (
        select cp.party_id as id from communication_parties cp
        where cp.communication_id = c.id and cp.party_type = 'person'
        union
        select x.to_id from relations x
        where x.from_type = 'communication' and x.from_id = c.id and x.to_type = 'person'
        union
        select x.from_id from relations x
        where x.to_type = 'communication' and x.to_id = c.id and x.from_type = 'person'
      ) s on true
      where ${scoped(communications, workspaceId, 'c')}
        and c.occurred_at <= ${now.toISOString()}::timestamptz and s.id in (${wanted})
      order by s.id, c.occurred_at desc, c.id desc`),
    z.object({ personId: z.string(), kind: z.enum(['sent', 'received']), at: z.coerce.date() }),
  )
  for (const r of rows) out.set(r.personId, { kind: r.kind, at: r.at.toISOString() })
  return out
}
