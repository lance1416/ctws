import {
  type BirthdayInput,
  type CircleId,
  type CreatePersonBody,
  type PersonAlias,
  type PersonChannel,
  REMIND_LEAD_DEFAULT,
  type UpdatePersonBody,
  type PersonId,
  personId,
} from '@ctws/contracts'
import { displayName, type NameParts, sortKey, splitName } from '@ctws/core'
import { newId } from '../../platform/db/ids'
import { eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import type { Db, Tx } from '../../platform/db/client'
import { replaceRows } from '../../platform/db/replace'
import { type Actor, scoped, within } from '../../platform/db/scope'
import { cityTimeZone } from '../../shell/cities'
import { eventLog } from '../../shell/events'
import { assertProjectsVisible } from '../../shell/projects'
import { putRoles, removeRolesOf } from '../organisations'
import { assertPossibleBirthday } from './birthdays'
import { assertCirclesVisible } from './circles'
import { getPerson, lockPerson, type PersonRow, putProjects } from './queries'
import { people, personAliases, personChannels, personCircles } from './tables'
import { NotFound } from '../../platform/errors'

const checkBirthday = (b: BirthdayInput | null | undefined): void => {
  if (b) assertPossibleBirthday({ ...b, year: b.year ?? null })
}

/** `null` clears the birthday; `undefined` leaves its columns alone. */
function birthdayColumns(b: BirthdayInput | null | undefined) {
  if (b === undefined) return {}
  if (b === null) {
    return {
      birthdayCalendar: null,
      birthdayYear: null,
      birthdayMonth: null,
      birthdayDay: null,
      birthdayLeapMonth: false,
      birthdayHourBranch: null,
      // Reset, or the next birthday written would inherit a lead nobody chose.
      birthdayRemindLead: REMIND_LEAD_DEFAULT,
    }
  }
  return {
    birthdayCalendar: b.calendar,
    birthdayYear: b.year ?? null,
    birthdayMonth: b.month,
    birthdayDay: b.day,
    birthdayLeapMonth: b.leapMonth,
    birthdayHourBranch: b.hourBranch ?? null,
    // Unsaid on an edit keeps the person's choice; unsaid on a create takes the default.
    ...(b.remindLead === undefined ? {} : { birthdayRemindLead: b.remindLead }),
  }
}

/**
 * The name's three parts and what follows from them (FR-049): given as parts, or as one string
 * split the way the migration splits it. `current` is the stored name on an edit.
 */
function nameColumns(
  input: Pick<UpdatePersonBody, 'name' | 'givenName' | 'middleName' | 'familyName'>,
  current: NameParts | null,
) {
  const partsGiven =
    input.givenName !== undefined ||
    input.middleName !== undefined ||
    input.familyName !== undefined
  let parts: NameParts
  if (partsGiven) {
    parts = {
      givenName: input.givenName ?? current?.givenName ?? '',
      middleName: input.middleName === undefined ? (current?.middleName ?? null) : input.middleName,
      familyName: input.familyName === undefined ? (current?.familyName ?? null) : input.familyName,
    }
  } else if (input.name !== undefined) {
    const { why: _, ...split } = splitName(input.name)
    parts = split
  } else {
    return null
  }
  return { ...parts, name: displayName(parts), sortKey: sortKey(parts) }
}

/**
 * The zone a person keeps time in (FR-049): set by hand, or taken from the city they live in. On
 * an edit, a city change moves a zone that came from the city and leaves one set by hand.
 */
function zoneColumns(
  input: Pick<UpdatePersonBody, 'timeZone' | 'city' | 'cityKey'>,
  current: Pick<PersonRow, 'timeZone' | 'timeZoneSource' | 'city' | 'cityKey'> | null,
) {
  const city = input.city === undefined ? (current?.city ?? null) : input.city
  const cityKey = input.cityKey === undefined ? (current?.cityKey ?? null) : input.cityKey
  const fromCity = () => {
    const zone = cityTimeZone(cityKey, city)
    return { timeZone: zone, timeZoneSource: zone === null ? null : ('city' as const) }
  }
  if (input.timeZone !== undefined) {
    return input.timeZone === null
      ? fromCity()
      : { timeZone: input.timeZone, timeZoneSource: 'manual' as const }
  }
  const cityChanged = input.city !== undefined || input.cityKey !== undefined
  if (cityChanged && current?.timeZoneSource !== 'manual') return fromCity()
  return {}
}

/** Replaces a person's other names as a set, in their given order. */
async function putAliases(
  q: Tx,
  personId: PersonId,
  aliases: readonly PersonAlias[],
): Promise<void> {
  const rows = aliases.map((a, rank) => ({
    id: uuidv7(),
    personId,
    name: a.name,
    label: a.label ?? null,
    rank,
  }))
  await replaceRows(q, personAliases, eq(personAliases.personId, personId), rows)
}

/** Puts a person in exactly these circles. */
async function putCircleMemberships(
  q: Tx,
  personId: PersonId,
  circleIds: readonly CircleId[],
): Promise<void> {
  const rows = [...new Set(circleIds)].map((circleId) => ({ personId, circleId }))
  await replaceRows(q, personCircles, eq(personCircles.personId, personId), rows)
}

/** Replaces a person's channels as a set, in their given order. */
async function putChannels(
  q: Tx,
  personId: PersonId,
  channels: readonly PersonChannel[],
): Promise<void> {
  const rows = channels.map((c, rank) => ({
    id: uuidv7(),
    personId,
    kind: c.kind,
    value: c.value,
    label: c.label ?? null,
    rank,
  }))
  await replaceRows(q, personChannels, eq(personChannels.personId, personId), rows)
}

export async function createPerson(
  db: Db,
  { workspaceId, now }: Actor,
  body: CreatePersonBody,
): Promise<PersonRow> {
  checkBirthday(body.birthday)
  return db.transaction(async (tx) => {
    await assertProjectsVisible(tx, workspaceId, body.projectIds ?? [])
    await assertCirclesVisible(tx, workspaceId, body.circleIds ?? [])
    const id = newId(personId)
    const named = nameColumns(body, null)
    if (named === null) throw new Error('a person needs a name')
    await tx.insert(people).values({
      id,
      workspaceId,
      ...named,
      ...zoneColumns(body, null),
      cityKey: body.cityKey ?? null,
      hometownKey: body.hometownKey ?? null,
      org: body.org ?? null,
      note: body.note ?? null,
      gender: body.gender ?? null,
      hometown: body.hometown ?? null,
      city: body.city ?? null,
      title: body.title ?? null,
      circle: body.circle ?? null,
      ...birthdayColumns(body.birthday ?? undefined),
      createdAt: now,
      updatedAt: now,
    })
    await putProjects(tx, workspaceId, id, body.projectIds ?? [])
    await putChannels(tx, id, body.channels ?? [])
    await putAliases(tx, id, body.aliases ?? [])
    await putCircleMemberships(tx, id, body.circleIds ?? [])
    await eventLog(tx, { workspaceId, now }).append({ type: 'person', id }, 'created', {
      to: { name: named.name },
    })
    return getPerson(tx, workspaceId, id)
  })
}

export async function updatePerson(
  db: Db,
  { workspaceId, now }: Actor,
  id: PersonId,
  patch: UpdatePersonBody,
): Promise<PersonRow> {
  checkBirthday(patch.birthday)
  return db.transaction(async (tx) => {
    // A foreign id is not found before anything is written.
    const current = await lockPerson(tx, workspaceId, id)
    if (patch.projectIds) await assertProjectsVisible(tx, workspaceId, patch.projectIds)
    if (patch.circleIds) await assertCirclesVisible(tx, workspaceId, patch.circleIds)

    const {
      channels,
      projectIds,
      birthday,
      aliases,
      circleIds,
      name: _name,
      givenName: _g,
      middleName: _m,
      familyName: _f,
      timeZone: _z,
      ...fields
    } = patch
    // Touched even when only the channels change: a new phone number is a change to the person.
    await tx
      .update(people)
      .set({
        ...fields,
        ...(nameColumns(patch, current) ?? {}),
        ...zoneColumns(patch, current),
        ...birthdayColumns(birthday),
        updatedAt: now,
      })
      .where(within(scoped(people, workspaceId), eq(people.id, id)))
    if (projectIds) await putProjects(tx, workspaceId, id, projectIds)
    if (channels) await putChannels(tx, id, channels)
    if (aliases) await putAliases(tx, id, aliases)
    if (circleIds) await putCircleMemberships(tx, id, circleIds)
    const log = eventLog(tx, { workspaceId, now })
    const named2 = nameColumns(patch, current)
    if (named2 !== null && named2.name !== current.name) {
      await log.append({ type: 'person', id }, 'field_changed', {
        field: 'name',
        from: current.name,
        to: named2.name,
      })
    }
    for (const field of ['note', 'hometown', 'city', 'gender'] as const) {
      const next = fields[field]
      if (next !== undefined && next !== current[field]) {
        await log.append({ type: 'person', id }, 'field_changed', {
          field,
          from: current[field],
          to: next,
        })
      }
    }
    return getPerson(tx, workspaceId, id)
  })
}

/** Replaces a person's roles as a set, in the order given (FR-047). */
export async function replaceRoles(
  db: Db,
  ctx: Actor,
  id: PersonId,
  roles: Parameters<typeof putRoles>[3],
): Promise<PersonRow> {
  return db.transaction(async (tx) => {
    await lockPerson(tx, ctx.workspaceId, id)
    await putRoles(tx, ctx, id, roles)
    await tx
      .update(people)
      .set({ updatedAt: ctx.now })
      .where(within(scoped(people, ctx.workspaceId), eq(people.id, id)))
    return getPerson(tx, ctx.workspaceId, id)
  })
}

export async function softDeletePerson(db: Db, ctx: Actor, id: PersonId): Promise<void> {
  const { workspaceId, now } = ctx
  await db.transaction(async (tx) => {
    const deleted = await tx
      .update(people)
      .set({ deletedAt: now })
      .where(within(scoped(people, workspaceId), eq(people.id, id)))
      .returning({ id: people.id })
    if (deleted.length === 0) throw new NotFound('Person')
    // The roles have no foreign key to the person (another module's table): dropped here.
    await removeRolesOf(tx, ctx, id)
  })
}
