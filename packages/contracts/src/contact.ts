import { z } from 'zod'
import { calendarDate } from './task'

/**
 * CONTACTS -- THE THIRD MODULE.
 *
 * The model is vCard 4.0's (RFC 6350), cut down to what one person needs: a formatted name (`FN`),
 * an organisation (`ORG`), free notes (`NOTE`), and a REPEATABLE set of ways to reach someone
 * (`EMAIL` / `TEL` / `URL`), each with an optional type label.
 *
 * The repeatable part is the whole reason to follow the standard rather than invent: a single
 * `email` column is the mistake every hand-rolled contact model makes, and it is wrong the first
 * time somebody has a work address and a personal one. vCard has said so since 1996.
 *
 * What is deliberately NOT modelled, because a personal workbench is not a CRM: organisations as
 * entities of their own, interaction history, photos, structured postal addresses (`ADR`), and
 * tags. Birthdays were on that list too, and are not any more: they were asked for, so they are
 * here. A hometown and a city are PLACE NAMES rather than `ADR` -- a city is not something you can
 * post a letter to, and calling it an address would be a lie.
 */

/** vCard's `EMAIL`, `TEL` and `URL`. The three ways one person actually reaches another. */
export const CHANNEL_KINDS = ['email', 'phone', 'url'] as const
export const channelKind = z.enum(CHANNEL_KINDS)
export type ChannelKind = z.infer<typeof channelKind>

/**
 * One way to reach someone.
 *
 * `label` is vCard's TYPE parameter, left as free text rather than an enum: vCard's own list
 * (work, home, cell, …) is advisory, and "the one for interviews" is a more useful label than
 * anything a fixed set would offer.
 */
export const contactChannel = z
  .object({
    kind: channelKind,
    value: z.string().trim().min(1).max(500),
    label: z.string().trim().min(1).max(60).nullish(),
  })
  .strict()
export type ContactChannel = z.infer<typeof contactChannel>

/** The calendar a birthday was GIVEN in. Entered once; the other one is derived (birthdays spec §2). */
export const BIRTHDAY_CALENDARS = ['solar', 'lunar'] as const
export const GENDERS = ['male', 'female', 'other'] as const
/** Where a person sits in your life. The birthdays page groups by it; the contact list filters by it. */
export const CIRCLES = ['family', 'friend', 'work'] as const
export type Circle = (typeof CIRCLES)[number]
/** How early to put someone on the workbench card. 0 is the day itself. */
export const REMIND_LEADS = [7, 3, 1, 0] as const
export type RemindLead = (typeof REMIND_LEADS)[number]

const SOLAR_MONTH_LENGTHS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const remindLead = z.union([z.literal(7), z.literal(3), z.literal(1), z.literal(0)])
const place = z.string().trim().min(1).max(120)

/**
 * ONE BIRTHDAY, written in the calendar it was given in. Every derived value -- the other
 * calendar, the zodiac, the sign, the age -- is computed by the server and never stored.
 *
 * `year` may be absent, and that is a first-class case rather than missing data: it is vCard 4.0's
 * `BDAY:--0415` (RFC 6350 section 6.2.5).
 */
export const birthdayInput = z
  .object({
    calendar: z.enum(BIRTHDAY_CALENDARS),
    year: z.number().int().min(1850).max(2200).nullish(),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    leapMonth: z.boolean().default(false),
    /** 0..11, 子 to 亥. A branch and not a clock: people know 「午时」, not 14:05. */
    hourBranch: z.number().int().min(0).max(11).nullish(),
    /** How early, not which days: one choice of four. See the workbench card. */
    remindLead: remindLead.default(7),
  })
  .strict()
  .refine((b) => b.calendar === 'lunar' || !b.leapMonth, {
    message: 'only a lunar birthday has a leap month',
  })
  .refine((b) => b.calendar === 'solar' || b.day <= 30, {
    message: 'a lunar month has at most 30 days',
  })
  .refine((b) => b.calendar === 'lunar' || b.day <= (SOLAR_MONTH_LENGTHS[b.month - 1] ?? 31), {
    message: 'that day does not exist in that month',
  })
export type BirthdayInput = z.infer<typeof birthdayInput>

/** A birthday read back: the stored half, plus everything DERIVED and never stored. */
export const birthdayResponse = z
  .object({
    calendar: z.enum(BIRTHDAY_CALENDARS),
    year: z.number().nullable(),
    month: z.number(),
    day: z.number(),
    leapMonth: z.boolean(),
    hourBranch: z.number().nullable(),
    remindLead: z.number(),
    lunarDate: z.string().nullable(),
    bornSolar: z.string().nullable(),
    bornLunar: z.string().nullable(),
    zodiac: z.string().nullable(),
    sign: z.string().nullable(),
    hour: z.string().nullable(),
    next: z
      .object({
        day: calendarDate,
        inDays: z.number(),
        turns: z.number().nullable(),
        /** The year had no such day and it was moved -- the page says each one out loud. */
        kept: z.array(z.string()),
        /** The same thing in a sentence, for a person. Null when nothing moved. */
        keptNote: z.string().nullable(),
      })
      .strict(),
  })
  .strict()
export type BirthdayResponse = z.infer<typeof birthdayResponse>

/**
 * The derived line shown WHILE TYPING a birthday in. A small stateless endpoint, so the rules have
 * exactly one implementation: the other way is shipping a 750 KB lunar library to the browser.
 */
export const birthdayPreviewQuery = z
  .object({
    calendar: z.enum(BIRTHDAY_CALENDARS),
    year: z.coerce.number().int().min(1850).max(2200).optional(),
    month: z.coerce.number().int().min(1).max(12),
    day: z.coerce.number().int().min(1).max(31),
    leap: z.enum(['true', 'false']).optional(),
    hour: z.coerce.number().int().min(0).max(11).optional(),
  })
  .strict()
  .refine((b) => b.calendar === 'lunar' || b.leap !== 'true', {
    message: 'only a lunar birthday has a leap month',
  })
  .refine((b) => b.calendar === 'solar' || b.day <= 30, {
    message: 'a lunar month has at most 30 days',
  })
  .refine((b) => b.calendar === 'lunar' || b.day <= (SOLAR_MONTH_LENGTHS[b.month - 1] ?? 31), {
    message: 'that day does not exist in that month',
  })

export type BirthdayPreviewResponse = z.infer<typeof birthdayPreviewResponse>

export const birthdayPreviewResponse = birthdayResponse.omit({
  calendar: true,
  year: true,
  month: true,
  day: true,
  leapMonth: true,
  hourBranch: true,
  remindLead: true,
})

/** One row on the birthdays page. The segmenting and the counting are the server's (spec §8.4). */
export const birthdayListRow = z
  .object({
    contactId: z.uuid(),
    name: z.string(),
    circle: z.enum(CIRCLES).nullable(),
    calendar: z.enum(BIRTHDAY_CALENDARS),
    day: calendarDate,
    inDays: z.number(),
    turns: z.number().nullable(),
    lunarDate: z.string().nullable(),
    kept: z.array(z.string()),
    remindLead: z.number(),
  })
  .strict()
export type BirthdayListRow = z.infer<typeof birthdayListRow>

export const birthdaysResponse = z
  .object({
    today: calendarDate,
    coming: z.array(birthdayListRow),
    later: z.array(birthdayListRow),
    /** Who the workbench card shows: each person by their own lead. */
    card: z.array(birthdayListRow),
    /** Only the months that have somebody: zero is not drawn as 0. */
    byMonth: z.record(z.string(), z.number()),
    circles: z.record(z.string(), z.number()),
  })
  .strict()
export type BirthdaysResponse = z.infer<typeof birthdaysResponse>

const contactName = z.string().trim().min(1).max(200)
const org = z.string().trim().min(1).max(200)
const note = z.string().max(10_000)

/**
 * Channels are written as a WHOLE LIST, never one at a time.
 *
 * A contact's addresses are read, shown and edited together, so endpoints per channel would be
 * three more routes and a client that has to sequence them. The server replaces the set.
 */
const channels = z.array(contactChannel).max(20)

export const createContactBody = z
  .object({
    name: contactName,
    org: org.nullish(),
    note: note.nullish(),
    /** The lines of work this person is on. A person is often on several. */
    projectIds: z.array(z.uuid()).max(20).optional(),
    channels: channels.optional(),
    birthday: birthdayInput.nullish(),
    gender: z.enum(GENDERS).nullish(),
    hometown: place.nullish(),
    city: place.nullish(),
    title: org.nullish(),
    circle: z.enum(CIRCLES).nullish(),
  })
  .strict()
export type CreateContactBody = z.infer<typeof createContactBody>

export const updateContactBody = z
  .object({
    name: contactName.optional(),
    org: org.nullable().optional(),
    note: note.nullable().optional(),
    projectIds: z.array(z.uuid()).max(20).optional(),
    channels: channels.optional(),
    birthday: birthdayInput.nullish(),
    gender: z.enum(GENDERS).nullish(),
    hometown: place.nullish(),
    city: place.nullish(),
    title: org.nullish(),
    circle: z.enum(CIRCLES).nullish(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'expected at least one field' })
export type UpdateContactBody = z.infer<typeof updateContactBody>

export const contactResponse = z
  .object({
    id: z.uuid(),
    name: z.string(),
    org: z.string().nullable(),
    note: z.string().nullable(),
    /**
     * The projects this person is on, named, so a list needs no second request.
     *
     * A LIST because a person is often on several: a maintainer who is on two of your repos, a
     * recruiter holding two roles open.
     */
    projects: z.array(z.object({ id: z.uuid(), name: z.string() }).strict()),
    channels: z.array(contactChannel),
    birthday: birthdayResponse.nullable(),
    gender: z.enum(GENDERS).nullable(),
    hometown: z.string().nullable(),
    city: z.string().nullable(),
    title: z.string().nullable(),
    circle: z.enum(CIRCLES).nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
export type ContactResponse = z.infer<typeof contactResponse>

export const contactListQuery = z
  .object({
    projectId: z.uuid().optional(),
    /** Only the people who are on no project at all. */
    unfiled: z.enum(['true', 'false']).optional(),
  })
  .strict()
  .refine((q) => !(q.projectId && q.unfiled === 'true'), {
    message: 'unfiled and projectId cannot both be asked for',
  })
