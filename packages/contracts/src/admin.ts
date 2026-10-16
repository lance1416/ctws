import { z } from 'zod'
import { userId } from './id'
import { email, newPassword, roleSchema } from './auth'
import { canonicalTimeZone, instant, patchOf } from './common'

export const adminUser = z
  .object({
    id: userId,
    email: z.email(),
    role: roleSchema,
    disabledAt: instant.nullable(),
    createdAt: instant,
  })
  .strict()

export const userParams = z.object({ id: userId }).strict()

export const adminUserListResponse = z.object({ users: z.array(adminUser) }).strict()

export const adminCreateUserBody = z
  .object({
    email,
    password: newPassword,
    timezone: canonicalTimeZone,
    role: roleSchema,
  })
  .strict()

export const adminUpdateUserBody = patchOf({ role: roleSchema, disabled: z.boolean() })

export type AdminUser = z.infer<typeof adminUser>
