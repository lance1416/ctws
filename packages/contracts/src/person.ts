import { z } from 'zod'
import { circleId, organisationId, personId, projectId } from './id'
import { birthdayInput, birthdayResponse } from './birthday'
import { calendarDate, eventTimeZone, instant, nameText, noteText, patchOf } from './common'
import { LIST_PAGE, pageInfo, pageQuery } from './page'

/**
 * A person, after vCard 4.0 (RFC 6350): a formatted name, an organisation, notes, and a
 * repeatable set of ways to reach them. A hometown and a city are place names, not addresses.
 */

/** vCard's `EMAIL`, `TEL` and `URL`. */
export const CHANNEL_KINDS = ['email', 'phone', 'url'] as const
export type ChannelKind = (typeof CHANNEL_KINDS)[number]

/**
 * What each kind of address must look like: loose enough for real numbers and addresses, strict
 * enough to refuse a placeholder. Each refusal names the rule that is missing.
 */
const CHANNEL_SHAPES: Record<ChannelKind, (v: string) => string | null> = {
  email: (v) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'an email address looks like name@example.com',
  // Stored as E.164, which has at most 15 digits including the country code (ITU-T E.164 6.2.1).
  phone: (v) => {
    if (!/^\+?[\d\s()-]+$/.test(v)) return 'a phone number is digits, spaces, dashes and brackets'
    if (!v.startsWith('+')) return 'start with the country code, like +86'
    const digits = (v.match(/\d/g) ?? []).length
    if (digits < 5) return 'that is too short for a phone number'
    if (digits > 15) return 'a phone number has at most 15 digits'
    return null
  },
  // The host needs a dot; the scheme may be left out. No `URL`: this package runs without DOM types.
  url: (v) => {
    const host = (v.replace(/^https?:\/\//i, '').split(/[/?#]/)[0] ?? '').toLowerCase()
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)
      ? null
      : 'a link needs a host, like github.com/you'
  },
}

/** Why `value` is not an address of this kind, or null when it is one. */
export function channelProblem(kind: ChannelKind, value: string): string | null {
  const trimmed = value.trim()
  if (trimmed === '') return 'an address cannot be empty'
  return CHANNEL_SHAPES[kind](trimmed)
}

/** One way to reach someone; `label` is vCard's `TYPE`, as free text. */
const personChannel = z
  .object({
    kind: z.enum(CHANNEL_KINDS),
    value: z.string().trim().min(1).max(500),
    label: z.string().trim().min(1).max(60).nullish(),
  })
  .strict()
  .superRefine((c, ctx) => {
    const problem = channelProblem(c.kind, c.value)
    if (problem !== null) ctx.addIssue({ code: 'custom', message: problem, path: ['value'] })
  })

/** A channel read back: what was stored, which passed the checks above on the way in. */
const channelResponse = z.object({
  kind: z.enum(CHANNEL_KINDS),
  value: z.string(),
  label: z.string().nullish(),
})
export type PersonChannel = z.infer<typeof personChannel>

export const GENDERS = ['male', 'female', 'other'] as const
export type Gender = (typeof GENDERS)[number]
/** Where a person sits in your life. */
export const CIRCLES = ['family', 'friend', 'work'] as const
export type Circle = (typeof CIRCLES)[number]

const personName = nameText
const org = nameText
/** A job title: what someone is called at their organisation. */
const jobTitle = nameText
const note = noteText
const place = z.string().trim().min(1).max(120)
/** Written as a whole list; the server replaces the set. */
const channels = z.array(personChannel).max(20)

export const personParams = z.object({ id: personId }).strict()

/** A month, `YYYY-MM`: roles are known to the month (FR-047). */
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'expected a month like 2026-03')

/** One role on the way in. No `to` means the role is current. */
const personRoleInput = z
  .object({
    organisationId,
    title: jobTitle.nullish(),
    from: month.nullish(),
    to: month.nullish(),
  })
  .strict()
  .refine((r) => !r.from || !r.to || r.from <= r.to, {
    message: 'The end is before the start.',
    path: ['to'],
  })
export type PersonRoleInput = z.infer<typeof personRoleInput>

/** A person's roles, written as a whole list; the server replaces the set. */
export const putRolesBody = z.object({ roles: z.array(personRoleInput).max(50) }).strict()

/** A role read back, with the organisation named. */
const personRoleResponse = z.object({
  organisationId,
  organisationName: z.string(),
  title: z.string().nullable(),
  from: month.nullable(),
  to: month.nullable(),
})

/** One other name, with an optional label of your own. */
const personAlias = z
  .object({ name: nameText, label: z.string().trim().min(1).max(60).nullish() })
  .strict()
const aliasResponse = z.object({ name: z.string(), label: z.string().nullable() })
export type PersonAlias = z.infer<typeof personAlias>

/**
 * What can be said about a person; null clears a field. The name comes as its three parts
 * (FR-049), or as one string that the server splits the way the migration does; one or the other
 * is needed to add someone. `timeZone` null means "from the city they live in".
 */
const personFields = {
  name: personName,
  givenName: nameText,
  middleName: nameText.nullable(),
  familyName: nameText.nullable(),
  aliases: z.array(personAlias).max(10),
  circleIds: z.array(circleId).max(20),
  timeZone: eventTimeZone.nullable(),
  cityKey: z.string().max(240).nullable(),
  hometownKey: z.string().max(240).nullable(),
  org: org.nullable(),
  note: note.nullable(),
  projectIds: z.array(projectId).max(20),
  channels,
  birthday: birthdayInput.nullable(),
  gender: z.enum(GENDERS).nullable(),
  hometown: place.nullable(),
  city: place.nullable(),
  title: jobTitle.nullable(),
  circle: z.enum(CIRCLES).nullable(),
}

export const createPersonBody = z
  .object(personFields)
  .partial()
  .strict()
  .refine((b) => b.name !== undefined || b.givenName !== undefined, {
    message: 'a person needs a name',
    path: ['givenName'],
  })
export type CreatePersonBody = z.infer<typeof createPersonBody>

export const updatePersonBody = patchOf(personFields)
export type UpdatePersonBody = z.infer<typeof updatePersonBody>

export const personResponse = z.object({
  id: personId,
  /** As shown: the three parts in the order their script expects. */
  name: z.string(),
  givenName: z.string(),
  middleName: z.string().nullable(),
  familyName: z.string().nullable(),
  /** The letter the person is filed under. */
  sortKey: z.string(),
  aliases: z.array(aliasResponse),
  circleIds: z.array(circleId),
  timeZone: z.string().nullable(),
  timeZoneSource: z.enum(['city', 'manual']).nullable(),
  cityKey: z.string().nullable(),
  hometownKey: z.string().nullable(),
  org: z.string().nullable(),
  note: z.string().nullable(),
  projects: z.array(z.object({ id: projectId, name: z.string() })),
  channels: z.array(channelResponse),
  birthday: birthdayResponse.nullable(),
  gender: z.enum(GENDERS).nullable(),
  hometown: z.string().nullable(),
  city: z.string().nullable(),
  title: z.string().nullable(),
  circle: z.enum(CIRCLES).nullable(),
  /** In the person's own order; a role with no `to` is current. */
  roles: z.array(personRoleResponse),
  createdAt: instant,
  updatedAt: instant,
})
export type PersonResponse = z.infer<typeof personResponse>

export const peopleListQuery = z.object(pageQuery(LIST_PAGE)).strict()

/** The circles, in your order, with how many people are in each. */
export const circlesResponse = z.object({
  circles: z.array(z.object({ id: circleId, name: z.string(), count: z.number().int() })),
})

/**
 * The circles as a whole list, in order: one with an `id` is renamed, one without is new, one
 * left out is deleted (its people stay, and just leave it).
 */
export const putCirclesBody = z
  .object({
    circles: z
      .array(z.object({ id: circleId.optional(), name: z.string().trim().min(1).max(60) }).strict())
      .max(50),
  })
  .strict()
  .refine((b) => new Set(b.circles.map((c) => c.name)).size === b.circles.length, {
    message: 'two circles cannot have the same name',
    path: ['circles'],
  })
export type PutCirclesBody = z.infer<typeof putCirclesBody>

export const peopleResponse = z.object({ people: z.array(personResponse), page: pageInfo })

/** People as a search finds them: who, and how to tell them apart, without their notes. */
export const personSearchResponse = z.object({
  people: z.array(personResponse.omit({ note: true })),
  page: pageInfo,
})

/** One row on the birthdays page. */
const birthdayListRow = z.object({
  personId,
  name: z.string(),
  /** What their avatar shows (FR-049). */
  initials: z.string(),
  circle: z.enum(CIRCLES).nullable(),
  day: calendarDate,
  inDays: z.number(),
  turns: z.number().nullable(),
  /** Only for a lunar birthday. */
  lunarDate: z.string().nullable(),
  /** Which fallbacks moved the day this year. */
  kept: z.array(z.string()),
  /** Whose day it is counted in: the person's own zone, or the account's when they have none. */
  timeZone: z.string(),
})
export type BirthdayListRow = z.infer<typeof birthdayListRow>

export const birthdaysResponse = z.object({
  today: calendarDate,
  coming: z.array(birthdayListRow),
  later: z.array(birthdayListRow),
  /** Who the workbench card shows: each person by their own lead. */
  card: z.array(birthdayListRow),
  /** Only the months that have somebody. */
  byMonth: z.record(z.string(), z.number()),
  circles: z.record(z.string(), z.number()),
})
