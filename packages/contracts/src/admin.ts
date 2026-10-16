import { z } from 'zod'
import { userId } from './id'
import { email, newPassword, roleSchema } from './auth'
import { canonicalTimeZone, instant } from './common'

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

export const adminUpdateUserBody = z
  .object({
    role: roleSchema.optional(),
    disabled: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.role !== undefined || v.disabled !== undefined, {
    message: 'provide role and/or disabled',
  })

export type AdminUser = z.infer<typeof adminUser>
