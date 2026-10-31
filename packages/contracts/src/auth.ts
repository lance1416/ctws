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

/**
 * What the account changes: its time zone, whether single keys act (FR-029), whether the editor
 * takes vim's keys (REQ-002 FR-112), and how a note is laid out (REQ-002 FR-109, FR-116).
 */
export const updateMeBody = z
  .object({
    timezone: canonicalTimeZone,
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
  /** Whether the editor takes vim's keys on a desk (REQ-002 FR-112); off unless turned on. */
  vimKeys: z.boolean(),
  /** Whether a note's outline is shown beside it (REQ-002 FR-109). */
  outlineShown: z.boolean(),
  /** Whether a note stops at a readable line length instead of the full width (FR-109). */
  readableLines: z.boolean(),
  /** Whether a note is shown as its Markdown source (REQ-002 FR-116). */
  sourceView: z.boolean(),
})

export type MeResponse = z.infer<typeof meResponse>
