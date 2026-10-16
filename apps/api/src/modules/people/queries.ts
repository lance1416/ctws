import {
  idFrom,
  personId,
  type PersonChannel,
  type RemindLead,
  type MeetingId,
  type WorkspaceId,
  type PersonId,
  type ProjectId,
} from '@ctws/contracts'
import type { BirthdayCalendar } from '@ctws/core'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import type { Queryable, Tx } from '../../platform/db/client'
import { scoped, within } from '../../platform/db/scope'
import { textMatches } from '../../platform/db/sql'
import { groupBy } from '../../platform/values'
import { filing, projectsOf } from '../../shell/links/filing'
import { edgesFrom } from '../../shell/links/store'
import { people, personChannels } from './tables'
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
  projects: Named<ProjectId>[]
  channels: PersonChannel[]
  birthday: StoredBirthday | null
}

export const personFiling = filing('person', people)

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
  const [projectsOfPerson, channels] = await Promise.all([
    projectsOf(q, workspaceId, 'person', ids),
    q
      .select()
      .from(personChannels)
      .where(inArray(personChannels.personId, ids))
      .orderBy(asc(personChannels.rank), asc(personChannels.id)),
  ])
  const channelsOf = groupBy(
    channels,
    (c) => c.personId,
    (c): PersonChannel => ({ kind: c.kind, value: c.value, label: c.label }),
  )
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    org: p.org,
    note: p.note,
    projects: projectsOfPerson.get(p.id) ?? [],
    channels: channelsOf.get(p.id) ?? [],
    birthday: storedBirthdayOf(p),
    gender: p.gender,
    hometown: p.hometown,
    city: p.city,
    title: p.title,
    circle: p.circle,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }))
}

/** By name: a person list is read to find someone. */
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
    .orderBy(asc(people.name), asc(people.id))
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

/** By name, organisation or any address: "the one at @example.com" is a common question. */
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

/** The live people attending each meeting, by name, in from the edges and then the people. */
export async function attendeesOf(
  q: Queryable,
  workspaceId: WorkspaceId,
  meetingIds: readonly MeetingId[],
): Promise<Map<string, Named<PersonId>[]>> {
  const edges = await edgesFrom(q, workspaceId, {
    fromType: 'meeting',
    fromIds: meetingIds,
    toType: 'person',
    kind: 'attends',
  })
  if (edges.length === 0) return new Map()
  const attendees = await q
    .select({ id: people.id, name: people.name })
    .from(people)
    .where(
      within(
        scoped(people, workspaceId),
        inArray(
          people.id,
          edges.map((e) => idFrom(personId, e.toId)),
        ),
      ),
    )
    .orderBy(asc(people.name), asc(people.id))
  const meetingsOf = groupBy(
    edges,
    (e) => e.toId,
    (e) => e.fromId,
  )
  return groupBy(
    attendees.flatMap((person) =>
      (meetingsOf.get(person.id) ?? []).map((meetingId) => ({ meetingId, person })),
    ),
    (r) => r.meetingId,
    (r) => r.person,
  )
}
