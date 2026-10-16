import { z } from 'zod'
import { calendarDate } from './common'

/** The calendar a birthday was given in. The other one is derived. */
export const BIRTHDAY_CALENDARS = ['solar', 'lunar'] as const

/** Days ahead to surface a birthday. 0 is the day itself. */
export const REMIND_LEADS = [7, 3, 1, 0] as const
export type RemindLead = (typeof REMIND_LEADS)[number]

/** A week's notice until the person says otherwise; also what clearing a birthday restores. */
export const REMIND_LEAD_DEFAULT: RemindLead = 7

/** The years a birth year may be given in. */
export const BIRTH_YEARS = { min: 1850, max: 2200 } as const
const SOLAR_MONTH_LENGTHS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** The day-and-month checks a birthday must pass in either calendar. */
function refineBirthday<T extends z.ZodType<{ calendar: string; month: number; day: number }>>(
  schema: T,
  leapMonth: (b: z.infer<T>) => boolean,
) {
  return schema
    .refine((b) => b.calendar === 'lunar' || !leapMonth(b), {
      message: 'only a lunar birthday has a leap month',
    })
    .refine((b) => b.calendar === 'solar' || b.day <= 30, {
      message: 'a lunar month has at most 30 days',
    })
    .refine((b) => b.calendar === 'lunar' || b.day <= (SOLAR_MONTH_LENGTHS[b.month - 1] ?? 31), {
      message: 'that day does not exist in that month',
    })
}

/** A birthday in the calendar it was given in; the year may be unknown (vCard `BDAY:--0415`). */
export const birthdayInput = refineBirthday(
  z
    .object({
      calendar: z.enum(BIRTHDAY_CALENDARS),
      year: z.number().int().min(BIRTH_YEARS.min).max(BIRTH_YEARS.max).nullish(),
      month: z.number().int().min(1).max(12),
      day: z.number().int().min(1).max(31),
      leapMonth: z.boolean().default(false),
      /** 0..11, 子 to 亥. */
      hourBranch: z.number().int().min(0).max(11).nullish(),
      /** Optional rather than defaulted, so an edit that omits it keeps the person's choice. */
      remindLead: z.literal(REMIND_LEADS).optional(),
    })
    .strict(),
  (b) => b.leapMonth,
)
export type BirthdayInput = z.infer<typeof birthdayInput>

/** A birthday read back: what is stored, plus everything derived from it. */
export const birthdayResponse = z
  .object({
    calendar: z.enum(BIRTHDAY_CALENDARS),
    year: z.number().nullable(),
    month: z.number(),
    day: z.number(),
    leapMonth: z.boolean(),
    hourBranch: z.number().nullable(),
    remindLead: z.literal(REMIND_LEADS),
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
        /** Which fallback moved the day this year, in a sentence. */
        keptNote: z.string().nullable(),
      })
      .strict(),
  })
  .strict()
export type BirthdayResponse = z.infer<typeof birthdayResponse>

/** What a birthday would mean, while it is being typed. */
export const birthdayPreviewQuery = refineBirthday(
  z
    .object({
      calendar: z.enum(BIRTHDAY_CALENDARS),
      year: z.coerce.number().int().min(BIRTH_YEARS.min).max(BIRTH_YEARS.max).optional(),
      month: z.coerce.number().int().min(1).max(12),
      day: z.coerce.number().int().min(1).max(31),
      leap: z.enum(['true', 'false']).optional(),
      hour: z.coerce.number().int().min(0).max(11).optional(),
    })
    .strict(),
  (b) => b.leap === 'true',
)

export const birthdayPreviewResponse = birthdayResponse.omit({
  calendar: true,
  year: true,
  month: true,
  day: true,
  leapMonth: true,
  hourBranch: true,
  remindLead: true,
})
export type BirthdayPreviewResponse = z.infer<typeof birthdayPreviewResponse>
