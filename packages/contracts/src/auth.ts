import { z } from 'zod'
import { userId, workspaceId } from './id'
import { canonicalTimeZone, instant } from './common'

/** Instance roles: an admin manages accounts, a member does not. */
export const ROLES = ['admin', 'member'] as const
export const roleSchema = z.enum(ROLES)
export type Role = z.infer<typeof roleSchema>

export const email = z.string().trim().toLowerCase().pipe(z.email().max(254))

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

/** The account's own settings it may change (artboard 30): its zone, for now. */
/** What the account page changes: its time zone, and whether single keys act (FR-029). */
export const updateMeBody = z
  .object({ timezone: canonicalTimeZone, singleKeyShortcuts: z.boolean() })
  .partial()
  .strict()
  .refine((b) => b.timezone !== undefined || b.singleKeyShortcuts !== undefined, {
    message: 'nothing to change',
  })

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
  now: instant,
  clockPinned: z.boolean(),
  /** The report of the move to the new layout, while it is not Done: how many items wait. */
  migrationReport: z.object({ pending: z.number().int().nonnegative() }).nullable(),
  /** When the password was last changed here; null for one set at sign-up. */
  passwordChangedAt: instant.nullable(),
  /** Whether keys without Ctrl or Alt act (FR-029); kept with the account. */
  singleKeyShortcuts: z.boolean(),
})

export type MeResponse = z.infer<typeof meResponse>
