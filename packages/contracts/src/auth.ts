import { z } from 'zod'
import { userId, workspaceId } from './id'
import { canonicalTimeZone, instant } from './common'

/** Instance roles: an admin manages accounts, a member does not. */
export const ROLES = ['admin', 'member'] as const
export const roleSchema = z.enum(ROLES)
export type Role = z.infer<typeof roleSchema>

export const email = z.string().trim().toLowerCase().pipe(z.email().max(254))

/** Light, dark, or whatever the device's system says. */
export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

/**
 * A handle unique in the instance: lowercase letters, digits and inner hyphens. Capitals are
 * taken as typed and lowered, so `Lance` and `lance` are the same handle.
 */
const username = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .string()
      .regex(
        /^[a-z0-9](?:[a-z0-9-]{1,30})[a-z0-9]$/,
        'Use 3 to 32 characters: lowercase letters, numbers and hyphens.',
      ),
  )

/** A time of day, `HH:mm`, 00:00 to 23:59. */
const wrapUpAt = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'a time of day, as 18:00')

/** One part of the account's own name; the same bounds as a person's. */
const namePart = z.string().trim().min(1).max(200)

/** A password being set: long enough to resist guessing, short enough to hash cheaply. */
export const newPassword = z.string().min(12).max(1024)

export const registerBody = z
  .object({
    email,
    password: newPassword,
    timezone: canonicalTimeZone,
  })
  .strict()

export const loginBody = z
  .object({
    email,
    password: z.string().min(1).max(1024),
  })
  .strict()

/**
 * What the account changes: its own name and handle, its time zone, its theme, whether single
 * keys act, whether the editor takes vim's keys, and how a note is laid out. A name part or the
 * handle set to null is cleared; the name as a whole keeps at least one part once it has one.
 */
export const updateMeBody = z
  .object({
    givenName: namePart.nullable(),
    middleName: namePart.nullable(),
    familyName: namePart.nullable(),
    username: username.nullable(),
    timezone: canonicalTimeZone,
    theme: z.enum(THEMES),
    wrapUpAt: wrapUpAt.nullable(),
    singleKeyShortcuts: z.boolean(),
    vimKeys: z.boolean(),
    outlineShown: z.boolean(),
    readableLines: z.boolean(),
    sourceView: z.boolean(),
  })
  .partial()
  .strict()
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'nothing to change',
  })
export type UpdateMeBody = z.infer<typeof updateMeBody>

/** A new password, given with the one it replaces. */
export const changePasswordBody = z
  .object({
    current: z.string().min(1).max(1024),
    next: newPassword,
  })
  .strict()

export const userResponse = z.object({
  id: userId,
  email: z.email(),
  timezone: z.string(),
  workspaceId: workspaceId,
  role: roleSchema,
})

/**
 * The signed-in account, and the server's clock: `now` is what the server calls the present,
 * which a test or acceptance stack pins (`CLOCK_PINNED_AT`), so the page can count from the same
 * instant the server does. When `clockPinned` is false the page may use its own clock.
 */
export const meResponse = userResponse.extend({
  /** The account's own name as shown, from its parts; null until it has one. */
  name: z.string().nullable(),
  givenName: z.string().nullable(),
  middleName: z.string().nullable(),
  familyName: z.string().nullable(),
  username: z.string().nullable(),
  /** The account's photo, read at `/avatars/:id`; null shows initials. */
  avatarId: z.string().nullable(),
  /**
   * Whether this server can keep photos at all. False: every photo control is disabled, and
   * everyone shows as initials.
   */
  photos: z.boolean(),
  /** Null until the account has chosen one, and shown as `system` until then. */
  theme: z.enum(THEMES).nullable(),
  /** When Today offers to wrap up the day, `HH:mm` in the account's zone; null: never. */
  wrapUpAt: z.string().nullable(),
  now: instant,
  clockPinned: z.boolean(),
  /** The report of the move to the new layout, while it is not Done: how many items wait. */
  migrationReport: z.object({ pending: z.number().int().nonnegative() }).nullable(),
  /** When the password was last changed here; null for one set at sign-up. */
  passwordChangedAt: instant.nullable(),
  /** Whether keys without Ctrl or Alt act; kept with the account. */
  singleKeyShortcuts: z.boolean(),
  /** Whether the editor takes vim's keys on a desk; off unless turned on. */
  vimKeys: z.boolean(),
  /** Whether a note's outline is shown beside it. */
  outlineShown: z.boolean(),
  /** Whether a note stops at a readable line length instead of the full width. */
  readableLines: z.boolean(),
  /** Whether a note is shown as its Markdown source. */
  sourceView: z.boolean(),
})

export type MeResponse = z.infer<typeof meResponse>
