import { z } from 'zod'
import { canonicalTimeZone } from './common'

/** Instance roles, admin > maintainer > member. */
const ROLES = ['admin', 'maintainer', 'member'] as const
export const roleSchema = z.enum(ROLES)
export type Role = z.infer<typeof roleSchema>

export const email = z.string().trim().toLowerCase().pipe(z.email().max(254))

export const registerBody = z
  .object({
    email,
    password: z.string().min(12).max(1024),
    timezone: canonicalTimeZone,
    inviteCode: z.string().optional(),
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
    id: z.uuid(),
    email: z.email(),
    timezone: z.string(),
    workspaceId: z.uuid(),
    role: roleSchema,
  })
  .strict()

export type UserResponse = z.infer<typeof userResponse>
