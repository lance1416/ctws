import {
  type BirthdayInput,
  type PersonChannel,
  type CreatePersonBody,
  REMIND_LEAD_DEFAULT,
  type UpdatePersonBody,
} from '@ctws/contracts'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import type { Queryable } from '../../platform/db/client'
import { textMatches } from '../../platform/db/sql'
import { links } from '../../shell/links/tables'
import { personChannels, people } from './tables'
import { filedUnder, projectsLinkedFrom, putLinks, unfiled } from '../../shell/links/store'
import { assertProjectsVisible } from '../../shell/projects/queries'
import { PersonNotFoundError } from './errors'

/** People's storage: vCard's shape (RFC 6350), cut to what one person needs. */

type PersonProject = { id: string; name: string }

/**
 * The stored half of a birthday. The derived half (the other calendar, the zodiac, the sign, the
 * age) is worked out on the way out, in the routes, because it needs today's date.
 */
export type StoredBirthday = {
  calendar: 'solar' | 'lunar'
  year: number | null
  month: number
  day: number
  leapMonth: boolean
  hourBranch: number | null
  remindLead: number
}

export type PersonRow = {
  id: string
  name: string
  org: string | null
  note: string | null
  projects: PersonProject[]
  channels: PersonChannel[]
  birthday: StoredBirthday | null
  gender: string | null
  hometown: string | null
  city: string | null
  title: string | null
  circle: string | null
  createdAt: Date
  updatedAt: Date
}

/** THE TENANT CHOKEPOINT. Every read and write below goes through it. */
function visiblePeople(workspaceId: string) {
  return and(eq(people.workspaceId, workspaceId), isNull(people.deletedAt))
}

type Selected = typeof people.$inferSelect

/** A birthday is a GROUP of columns: all present or all absent (the table's own CHECK says so). */
const birthdayOf = (row: Selected): StoredBirthday | null =>
  row.birthdayCalendar === null || row.birthdayMonth === null || row.birthdayDay === null
    ? null
    : {
        calendar: row.birthdayCalendar as 'solar' | 'lunar',
        year: row.birthdayYear,
        month: row.birthdayMonth,
        day: row.birthdayDay,
        leapMonth: row.birthdayLeapMonth,
        hourBranch: row.birthdayHourBranch,
        remindLead: row.birthdayRemindLead,
      }

/**
 * The same group on the way in. `null` means CLEAR IT; `undefined` means this write is not about
 * the birthday at all, so the columns are left alone.
 */
const birthdayColumns = (b: BirthdayInput | null | undefined) =>
  b === undefined
    ? {}
    : b === null
      ? {
          birthdayCalendar: null,
          birthdayYear: null,
          birthdayMonth: null,
          birthdayDay: null,
          birthdayLeapMonth: false,
          birthdayHourBranch: null,
          // BACK TO THE DEFAULT, not left as it was: the lead means nothing without a birthday,
          // and a value left behind here is inherited by the next birthday written for this
          // person -- a lead they never chose, with nothing on screen saying so. The column is
          // NOT NULL, so "cleared" is the 7 it starts at.
          birthdayRemindLead: REMIND_LEAD_DEFAULT,
        }
      : {
          birthdayCalendar: b.calendar,
          birthdayYear: b.year ?? null,
          birthdayMonth: b.month,
          birthdayDay: b.day,
          birthdayLeapMonth: b.leapMonth,
          birthdayHourBranch: b.hourBranch ?? null,
          // Only when it was SAID. Omitted on an edit, the column keeps the person's own choice;
          // omitted on a create, the column's default puts the 7 there.
          ...(b.remindLead === undefined ? {} : { birthdayRemindLead: b.remindLead }),
        }

/**
 * Attaches each person's projects and channels, in ONE query each for the whole page.
 *
 * Only projects the person can still SEE: projects are soft-deleted, so a row in the association
 * table can outlive the project it points at, and a name nobody can navigate to is worse than no
 * name. A query per person would be the N+1 this codebase refuses everywhere else.
 */
async function hydrate(q: Queryable, workspaceId: string, rows: Selected[]): Promise<PersonRow[]> {
  const ids = rows.map((r) => r.id)
  let byPerson = new Map<string, PersonProject[]>()
  const channelsOf = new Map<string, PersonChannel[]>()
  if (ids.length > 0) {
    const [linked, found] = await Promise.all([
      projectsLinkedFrom(q, workspaceId, 'person', ids),
      q
        .select()
        .from(personChannels)
        .where(inArray(personChannels.personId, ids))
        .orderBy(asc(personChannels.rank), asc(personChannels.id)),
    ])
    byPerson = linked
    for (const c of found) {
      const channel: PersonChannel = {
        kind: c.kind as PersonChannel['kind'],
        value: c.value,
        label: c.label,
      }
      const list = channelsOf.get(c.personId)
      if (list) list.push(channel)
      else channelsOf.set(c.personId, [channel])
    }
  }
  return rows.map((person) => ({
    id: person.id,
    name: person.name,
    org: person.org,
    note: person.note,
    projects: byPerson.get(person.id) ?? [],
    channels: channelsOf.get(person.id) ?? [],
    birthday: birthdayOf(person),
    gender: person.gender,
    hometown: person.hometown,
    city: person.city,
    title: person.title,
    circle: person.circle,
    createdAt: person.createdAt,
    updatedAt: person.updatedAt,
  }))
}

/** Replaces a person's whole channel set. Called inside the caller's transaction. */
async function putChannels(
  q: Queryable,
  personId: string,
  channels: readonly PersonChannel[],
): Promise<void> {
  await q.delete(personChannels).where(eq(personChannels.personId, personId))
  if (channels.length === 0) return
  await q.insert(personChannels).values(
    channels.map((c, rank) => ({
      id: uuidv7(),
      personId,
      kind: c.kind,
      value: c.value,
      label: c.label ?? null,
      rank,
    })),
  )
}

export async function listPeople(
  q: Queryable,
  workspaceId: string,
  opts: { projectId?: string; unfiled?: boolean } = {},
): Promise<PersonRow[]> {
  const rows = await q
    .select()
    .from(people)
    .where(
      and(
        visiblePeople(workspaceId),
        // Only VISIBLE projects: an edge to a soft-deleted project is an edge to nothing, so it
        // must not make a person count as filed either.
        opts.projectId ? filedUnder('person', 'people', opts.projectId) : undefined,
        opts.unfiled ? unfiled('person', 'people') : undefined,
      ),
    )
    // By name. A person list is looked at to FIND someone, and alphabetical is where a person
    // expects to find them -- unlike the reading pile, where the newest thing is the point.
    .orderBy(asc(people.name), asc(people.id))
  return hydrate(q, workspaceId, rows)
}

async function getPerson(q: Queryable, workspaceId: string, id: string): Promise<PersonRow> {
  const rows = await q
    .select()
    .from(people)
    .where(and(visiblePeople(workspaceId), eq(people.id, id)))
  if (rows.length === 0) throw new PersonNotFoundError()
  const [row] = await hydrate(q, workspaceId, rows)
  return row!
}

export async function createPerson(
  q: Queryable,
  workspaceId: string,
  body: CreatePersonBody,
): Promise<PersonRow> {
  await assertProjectsVisible(q, workspaceId, body.projectIds ?? [])
  const id = uuidv7()
  await q.insert(people).values({
    id,
    workspaceId,
    name: body.name,
    org: body.org ?? null,
    note: body.note ?? null,
    gender: body.gender ?? null,
    hometown: body.hometown ?? null,
    city: body.city ?? null,
    title: body.title ?? null,
    circle: body.circle ?? null,
    ...birthdayColumns(body.birthday ?? undefined),
  })
  await putLinks(
    q,
    workspaceId,
    { type: 'person', id },
    'project',
    'belongs',
    body.projectIds ?? [],
  )
  await putChannels(q, id, body.channels ?? [])
  return getPerson(q, workspaceId, id)
}

export async function updatePerson(
  q: Queryable,
  workspaceId: string,
  id: string,
  patch: UpdatePersonBody,
): Promise<PersonRow> {
  // Reads first, so an id from another workspace is "not found" before anything is written.
  await getPerson(q, workspaceId, id)
  if (patch.projectIds) await assertProjectsVisible(q, workspaceId, patch.projectIds)

  const { channels, projectIds, birthday, ...fields } = patch
  // An update of only the channels (or only the projects) must still touch the row, or
  // `updated_at` would say the person has not changed when their phone number just did.
  await q
    .update(people)
    .set({ ...fields, ...birthdayColumns(birthday), updatedAt: new Date() })
    .where(and(visiblePeople(workspaceId), eq(people.id, id)))
  if (projectIds) {
    await putLinks(q, workspaceId, { type: 'person', id }, 'project', 'belongs', projectIds)
  }
  if (channels) await putChannels(q, id, channels)
  return getPerson(q, workspaceId, id)
}

export async function softDeletePerson(
  q: Queryable,
  workspaceId: string,
  id: string,
): Promise<void> {
  const deleted = await q
    .update(people)
    .set({ deletedAt: new Date() })
    .where(and(visiblePeople(workspaceId), eq(people.id, id)))
    .returning({ id: people.id })
  if (deleted.length === 0) throw new PersonNotFoundError()
}

/**
 * This module's half of federated search: the name, the organisation, and every address.
 *
 * Searching the addresses is the point as often as the name is: "who was the one at
 * @example.com" is exactly the question a person list answers.
 */
export async function searchPeople(
  q: Queryable,
  workspaceId: string,
  query: string,
  limit = 20,
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
    .limit(limit)
  return hydrate(q, workspaceId, rows)
}

/** Every id names a live person in this workspace, or none of them is used. */
export async function assertPeopleVisible(
  q: Queryable,
  workspaceId: string,
  personIds: readonly string[],
): Promise<void> {
  if (personIds.length === 0) return
  const unique = [...new Set(personIds)]
  const rows = await q
    .select({ id: people.id })
    .from(people)
    .where(and(visiblePeople(workspaceId), inArray(people.id, unique)))
  if (rows.length !== unique.length) throw new PersonNotFoundError()
}

/** The people attending each meeting, by name, in one query; deleted people are left out. */
export async function attendeesOf(
  q: Queryable,
  workspaceId: string,
  meetingIds: readonly string[],
): Promise<Map<string, { id: string; name: string }[]>> {
  const by = new Map<string, { id: string; name: string }[]>()
  if (meetingIds.length === 0) return by
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
  for (const row of rows) {
    const person = { id: row.id, name: row.name }
    const list = by.get(row.meetingId)
    if (list) list.push(person)
    else by.set(row.meetingId, [person])
  }
  return by
}
