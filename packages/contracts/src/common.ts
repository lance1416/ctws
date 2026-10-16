import { z } from 'zod'

export const DAY_MS = 86_400_000

/**
 * A filtered view of a collection, asked for with `?view=<name>` on the collection's own path. It
 * takes nothing else unless `extra` says so.
 */
export const viewQuery = <const V extends string, S extends z.ZodRawShape = Record<never, never>>(
  view: V,
  extra: S = {} as S,
) => z.object({ view: z.literal(view), ...extra }).strict()

/** What a thing is called where it is listed: a task, a meeting, a book. */
export const titleText = z.string().trim().min(1).max(500)

/** Who or what something is: a project, a person, an organisation, an author. */
export const nameText = z.string().trim().min(1).max(200)

/**
 * A task's notes are its working document (checklists, tables, diagrams), so they get room for
 * one. A note on a person or a meeting is a few paragraphs beside the facts, and gets a tenth.
 */
export const documentText = z.string().max(100_000)
export const noteText = z.string().max(10_000)

/** The years a plan, a deadline or a meeting may fall in. */
export const EVENT_YEARS = { min: 1970, max: 2200 } as const

/**
 * A calendar day, `YYYY-MM-DD`, that exists. Not an instant: `z.coerce.date()` would accept a
 * timestamp and silently turn the day into one.
 */
export const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected a date in YYYY-MM-DD form')
  .refine(
    (value) => {
      const [y, m, d] = value.split('-').map(Number) as [number, number, number]
      const date = new Date(Date.UTC(y, m - 1, d))
      return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    },
    { message: 'not a real calendar date' },
  )

/** An instant with an offset. */
export const instant = z.iso.datetime({ offset: true })

/**
 * The zone an account is stored in: any IANA name the platform knows, stored as the one spelling
 * it resolves to. Browsers send their own spelling, which can be an alias the server's ICU renames
 * (Asia/Kolkata comes back as Asia/Calcutta), so the name is not required to match it.
 */
export const canonicalTimeZone = z.string().transform((value, ctx) => {
  if (value !== value.trim() || value.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'timezone must not be empty or padded' })
    return z.NEVER
  }
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone
  } catch {
    ctx.addIssue({ code: 'custom', message: `unknown IANA timezone: ${value}` })
    return z.NEVER
  }
})

/** The zone an event was agreed in: any IANA name the platform knows, aliases included. */
export const eventTimeZone = z
  .string()
  .min(1)
  .max(100)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz })
      return true
    } catch {
      return false
    }
  }, 'not a time zone this system knows')

/**
 * The body of an update: any of `shape`'s fields, at least one of them, and nothing else. A field
 * that may be cleared says so in the shape (`.nullable()`); left out, it is left as it is.
 */
export const patchOf = <Shape extends z.ZodRawShape>(shape: Shape) =>
  z
    .object(shape)
    .partial()
    .strict()
    .refine((b) => Object.keys(b).length > 0, { message: 'expected at least one field' })

/** RFC 9457 problem details: the shape of every refusal. */
export const problem = z
  .object({
    type: z.string().meta({ example: 'about:blank' }),
    title: z.string().meta({ example: 'Not Found' }),
    status: z.number().int().meta({ example: 404 }),
    detail: z.string().optional(),
  })
  .strict()
  .meta({
    description:
      'RFC 9457 problem details. Every refusal this API makes has this shape and is sent as application/problem+json.',
  })

export type Problem = z.infer<typeof problem>
