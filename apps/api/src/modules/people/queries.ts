import {
  type PersonChannel,
  type RemindLead,
  type MeetingId,
  type WorkspaceId,
  type PersonId,
  type ProjectId,
} from '@ctws/contracts'
import type { BirthdayCalendar } from '@ctws/core'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Queryable } from '../../platform/db/client'
import { textMatches } from '../../platform/db/sql'
import { groupBy } from '../../platform/values'
import { filing, projectsOf } from '../../shell/links/filing'
import { links } from '../../shell/links/tables'
import { PersonNotFoundError } from './errors'
import { people, personChannels } from './tables'

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

/** A live person in this workspace; every read and write goes through it. */
export function visiblePeople(workspaceId: WorkspaceId) {
  return and(eq(people.workspaceId, workspaceId), isNull(people.deletedAt))
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
export async function listPeople(q: Queryable, workspaceId: WorkspaceId): Promise<PersonRow[]> {
  const rows = await q
    .select()
    .from(people)
    .where(visiblePeople(workspaceId))
    .orderBy(asc(people.name), asc(people.id))
  return hydrate(q, workspaceId, rows)
}

export async function getPerson(
  q: Queryable,
  workspaceId: WorkspaceId,
  id: PersonId,
): Promise<PersonRow> {
  const rows = await q
    .select()
    .from(people)
    .where(and(visiblePeople(workspaceId), eq(people.id, id)))
  if (rows.length === 0) throw new PersonNotFoundError()
  const [row] = await hydrate(q, workspaceId, rows)
  return row!
}

/** How many people a search returns. */
const SEARCH_LIMIT = 20

/** By name, organisation or any address: "the one at @example.com" is a common question. */
export async function searchPeople(
  q: Queryable,
  workspaceId: WorkspaceId,
  query: string,
): Promise<PersonRow[]> {
  const rows = await q
    .select()
    .from(people)
    .where(
      and(
        visiblePeople(workspaceId),
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
    .limit(SEARCH_LIMIT)
  return hydrate(q, workspaceId, rows)
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
    .where(and(visiblePeople(workspaceId), inArray(people.id, unique)))
  if (rows.length !== unique.length) throw new PersonNotFoundError()
}

/** The live people attending each meeting, by name, in one query. */
export async function attendeesOf(
  q: Queryable,
  workspaceId: WorkspaceId,
  meetingIds: readonly MeetingId[],
): Promise<Map<string, Named<PersonId>[]>> {
  if (meetingIds.length === 0) return new Map()
  const rows = await q
    .select({ meetingId: links.fromId, id: people.id, name: people.name })
    .from(links)
    .innerJoin(people, eq(people.id, links.toId))
    .where(
      and(
        eq(links.workspaceId, workspaceId),
        eq(links.fromType, 'meeting'),
        inArray(links.fromId, [...meetingIds]),
        eq(links.toType, 'person'),
        eq(links.kind, 'attends'),
        isNull(people.deletedAt),
      ),
    )
    .orderBy(asc(people.name), asc(people.id))
  return groupBy(
    rows,
    (r) => r.meetingId,
    ({ id, name }) => ({ id, name }),
  )
}
