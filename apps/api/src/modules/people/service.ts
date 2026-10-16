import {
  type BirthdayInput,
  type CreatePersonBody,
  type PersonChannel,
  REMIND_LEAD_DEFAULT,
  type UpdatePersonBody,
  type PersonId,
  personId,
} from '@ctws/contracts'
import { newId } from '../../platform/db/ids'
import { eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import type { Db, Tx } from '../../platform/db/client'
import { replaceRows } from '../../platform/db/replace'
import { type Actor, scoped, within } from '../../platform/db/scope'
import { assertProjectsVisible } from '../../shell/projects/queries'
import { assertPossibleBirthday } from './birthdays'
import { getPerson, lockPerson, type PersonRow, personFiling } from './queries'
import { people, personChannels } from './tables'
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
    const id = newId(personId)
    await tx.insert(people).values({
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
      createdAt: now,
      updatedAt: now,
    })
    await personFiling.put(tx, { workspaceId, now, id, projectIds: body.projectIds ?? [] })
    await putChannels(tx, id, body.channels ?? [])
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
    await lockPerson(tx, workspaceId, id)
    if (patch.projectIds) await assertProjectsVisible(tx, workspaceId, patch.projectIds)

    const { channels, projectIds, birthday, ...fields } = patch
    // Touched even when only the channels change: a new phone number is a change to the person.
    await tx
      .update(people)
      .set({ ...fields, ...birthdayColumns(birthday), updatedAt: now })
      .where(within(scoped(people, workspaceId), eq(people.id, id)))
    if (projectIds) await personFiling.put(tx, { workspaceId, now, id, projectIds })
    if (channels) await putChannels(tx, id, channels)
    return getPerson(tx, workspaceId, id)
  })
}

export async function softDeletePerson(
  db: Db,
  { workspaceId, now }: Actor,
  id: PersonId,
): Promise<void> {
  const deleted = await db
    .update(people)
    .set({ deletedAt: now })
    .where(within(scoped(people, workspaceId), eq(people.id, id)))
    .returning({ id: people.id })
  if (deleted.length === 0) throw new NotFound('Person')
}
