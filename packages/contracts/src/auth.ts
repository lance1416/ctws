import { z } from 'zod'
import { userId, workspaceId } from './id'
import { canonicalTimeZone } from './common'

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

export const userResponse = z
  .object({
    id: userId,
    email: z.email(),
    timezone: z.string(),
    workspaceId: workspaceId,
    role: roleSchema,
  })
  .strict()

export type UserResponse = z.infer<typeof userResponse>
