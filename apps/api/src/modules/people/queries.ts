import {
  type CircleId,
  type PersonChannel,
  type RemindLead,
  type OrganisationId,
  type WorkspaceId,
  type PersonId,
  type ProjectId,
} from '@ctws/contracts'
import type { BirthdayCalendar } from '@ctws/core'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { rowsOf } from '../../platform/db/raw'
import { replaceRows } from '../../platform/db/replace'
import type { Queryable, Tx } from '../../platform/db/client'
import { scoped, within } from '../../platform/db/scope'
import { textMatches } from '../../platform/db/sql'
import { groupBy } from '../../platform/values'
import { monthOf, rolesOf } from '../organisations'
import {
  circles,
  people,
  personAliases,
  personChannels,
  personCircles,
  personProjects,
} from './tables'
import { projectScope } from '../../shell/projects'
import { NotFound } from '../../platform/errors'
import { type Page, type PageAsked, pageOf, spanOf } from '../../platform/db/page'

type Person = typeof people.$inferSelect
type Named<Id> = { id: Id; name: string }

/** The stored half of a birthday; the rest is derived on the way out, against today. */
export type StoredBirthday = {
  calendar: BirthdayCalendar
  year: number | null
  month: number
  day: number
  leapMonth: boolean
  hourBranch: number | null
  remindLead: RemindLead
}

export type PersonRow = Omit<
  Person,
  | 'workspaceId'
  | 'deletedAt'
  | 'birthdayCalendar'
  | 'birthdayYear'
  | 'birthdayMonth'
  | 'birthdayDay'
  | 'birthdayLeapMonth'
  | 'birthdayHourBranch'
  | 'birthdayRemindLead'
> & {
  projects: PersonProject[]
  channels: PersonChannel[]
  birthday: StoredBirthday | null
  roles: PersonRoleRow[]
  aliases: { name: string; label: string | null }[]
  circleIds: CircleId[]
}

type PersonRoleRow = {
  organisationId: OrganisationId
  organisationName: string
  title: string | null
  from: string | null
  to: string | null
}

const projectRow = z.object({
  personId: z.string(),
  id: z.string(),
  name: z.string(),
  openTasks: z.coerce.number(),
  lastActivityAt: z.coerce.date().nullable(),
})

type PersonProject = Named<ProjectId> & { openTasks: number; lastActivityAt: Date | null }

/**
 * The live projects each person is in, the one that moved last first (FR-061): with how many of
 * their tasks in it are still open, a task being theirs when it is linked to them either way.
 */
async function projectsOf(
  q: Queryable,
  workspaceId: WorkspaceId,
  ids: readonly PersonId[],
): Promise<Map<string, PersonProject[]>> {
  const result = await q.execute(sql`
    select pp.person_id as "personId", p.id, p.name,
      (
        select count(*) from tasks t
        where t.project_id = p.id and t.deleted_at is null
          and t.status not in ('done', 'cancelled')
          and exists (
            select 1 from relations r
            where r.workspace_id = ${workspaceId}
              and ((r.from_type = 'task' and r.from_id = t.id
                    and r.to_type = 'person' and r.to_id = pp.person_id)
                or (r.to_type = 'task' and r.to_id = t.id
                    and r.from_type = 'person' and r.from_id = pp.person_id))
          )
      ) as "openTasks",
      (
        select max(ev.occurred_at) from events ev
        join tasks ev_t on ev_t.id = ev.object_id and ev.object_type = 'task'
        where ev.workspace_id = ${workspaceId} and ev_t.project_id = p.id
      ) as "lastActivityAt"
    from person_projects pp
    join projects p on p.id = pp.project_id
    where ${projectScope(workspaceId, 'p')}
      and pp.person_id in (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})
    order by "lastActivityAt" desc nulls last, p.rank, p.id
  `)
  return groupBy(
    rowsOf(result, projectRow),
    (r) => r.personId,
    (r): PersonProject => ({
      id: r.id as ProjectId,
      name: r.name,
      openTasks: r.openTasks,
      lastActivityAt: r.lastActivityAt,
    }),
  )
}

/** Puts a person in exactly these projects. */
export async function putProjects(
  tx: Tx,
  workspaceId: WorkspaceId,
  personId: PersonId,
  projectIds: readonly ProjectId[],
): Promise<void> {
  await replaceRows(
    tx,
    personProjects,
    eq(personProjects.personId, personId),
    [...new Set(projectIds)].map((projectId) => ({ personId, workspaceId, projectId })),
  )
}

/** The birthday columns are all present or all absent; the table's check says so. */
function storedBirthdayOf(p: Person): StoredBirthday | null {
  if (p.birthdayCalendar === null || p.birthdayMonth === null || p.birthdayDay === null) {
    return null
  }
  return {
    calendar: p.birthdayCalendar,
    year: p.birthdayYear,
    month: p.birthdayMonth,
    day: p.birthdayDay,
    leapMonth: p.birthdayLeapMonth,
    hourBranch: p.birthdayHourBranch,
    remindLead: p.birthdayRemindLead,
  }
}

/** Attaches projects and channels to a page of people, one query each. */
async function hydrate(
  q: Queryable,
  workspaceId: WorkspaceId,
  rows: Person[],
): Promise<PersonRow[]> {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const [projectsOfPerson, channels, roles, aliases, memberships] = await Promise.all([
    projectsOf(q, workspaceId, ids),
    q
      .select()
      .from(personChannels)
      .where(inArray(personChannels.personId, ids))
      .orderBy(asc(personChannels.rank), asc(personChannels.id)),
    rolesOf(q, workspaceId, ids),
    q
      .select()
      .from(personAliases)
      .where(inArray(personAliases.personId, ids))
      .orderBy(asc(personAliases.rank), asc(personAliases.id)),
    q
      .select({ personId: personCircles.personId, circleId: personCircles.circleId })
      .from(personCircles)
      .innerJoin(circles, eq(circles.id, personCircles.circleId))
      .where(inArray(personCircles.personId, ids))
      .orderBy(asc(circles.rank), asc(circles.id)),
  ])
  const aliasesOf = groupBy(
    aliases,
    (a) => a.personId,
    (a) => ({ name: a.name, label: a.label }),
  )
  const circlesOf = groupBy(
    memberships,
    (m) => m.personId,
    (m) => m.circleId,
  )
  const channelsOf = groupBy(
    channels,
    (c) => c.personId,
    (c): PersonChannel => ({ kind: c.kind, value: c.value, label: c.label }),
  )
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    givenName: p.givenName,
    middleName: p.middleName,
    familyName: p.familyName,
    sortKey: p.sortKey,
    timeZone: p.timeZone,
    timeZoneSource: p.timeZoneSource,
    cityKey: p.cityKey,
    hometownKey: p.hometownKey,
    aliases: aliasesOf.get(p.id) ?? [],
    circleIds: circlesOf.get(p.id) ?? [],
    org: p.org,
    note: p.note,
    projects: projectsOfPerson.get(p.id) ?? [],
    channels: channelsOf.get(p.id) ?? [],
    birthday: storedBirthdayOf(p),
    roles: (roles.get(p.id) ?? []).map((r) => ({
      organisationId: r.organisationId,
      organisationName: r.organisationName,
      title: r.title,
      from: monthOf(r.fromMonth),
      to: monthOf(r.toMonth),
    })),
    gender: p.gender,
    hometown: p.hometown,
    city: p.city,
    title: p.title,
    circle: p.circle,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }))
}

/** Filed by the family name's letter, then by name: a person list is read to find someone. */
export async function listPeople(
  q: Queryable,
  workspaceId: WorkspaceId,
  asked: PageAsked,
): Promise<Page<PersonRow>> {
  const span = spanOf(asked)
  const rows = await q
    .select()
    .from(people)
    .where(scoped(people, workspaceId))
    .orderBy(asc(people.sortKey), asc(people.name), asc(people.id))
    .limit(span.limit)
    .offset(span.offset)
  const { rows: page, ...info } = pageOf(rows, asked)
  return { rows: await hydrate(q, workspaceId, page), ...info }
}

/** One live person in this workspace. Missing, deleted and foreign ids all read as not found. */
export async function getPerson(
  q: Queryable,
  workspaceId: WorkspaceId,
  id: PersonId,
): Promise<PersonRow> {
  const rows = await q
    .select()
    .from(people)
    .where(within(scoped(people, workspaceId), eq(people.id, id)))
  if (rows.length === 0) throw new NotFound('Person')
  const [row] = await hydrate(q, workspaceId, rows)
  return row!
}

/**
 * `getPerson`, with the row locked first. An edit takes it before it replaces the channels, so two
 * edits of one person cannot interleave their deletes and inserts.
 */
export async function lockPerson(
  tx: Tx,
  workspaceId: WorkspaceId,
  id: PersonId,
): Promise<PersonRow> {
  const [row] = await tx
    .select({ id: people.id })
    .from(people)
    .where(within(scoped(people, workspaceId), eq(people.id, id)))
    .for('update')
  if (!row) throw new NotFound('Person')
  return getPerson(tx, workspaceId, id)
}

/** By any name, organisation or address: "the one at @example.com" is a common question. */
export async function searchPeople(
  q: Queryable,
  workspaceId: WorkspaceId,
  query: string,
  asked: PageAsked,
): Promise<Page<PersonRow>> {
  const span = spanOf(asked)
  const rows = await q
    .select()
    .from(people)
    .where(
      within(
        scoped(people, workspaceId),
        sql`(
          ${textMatches(['people.name', 'people.org'], query)}
          or exists (
            select 1 from person_aliases al
            where al.person_id = people.id and ${textMatches(['al.name'], query)}
          )
          or exists (
            select 1 from person_channels ch
            where ch.person_id = people.id and ${textMatches(['ch.value'], query)}
          )
        )`,
      ),
    )
    .orderBy(asc(people.name), asc(people.id))
    .limit(span.limit)
    .offset(span.offset)
  const { rows: page, ...info } = pageOf(rows, asked)
  return { rows: await hydrate(q, workspaceId, page), ...info }
}

/** Every id names a live person in this workspace, or none is used. */
export async function assertPeopleVisible(
  q: Queryable,
  workspaceId: WorkspaceId,
  ids: readonly PersonId[],
): Promise<void> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return
  const rows = await q
    .select({ id: people.id })
    .from(people)
    .where(within(scoped(people, workspaceId), inArray(people.id, unique)))
  if (rows.length !== unique.length) throw new NotFound('Person')
}
