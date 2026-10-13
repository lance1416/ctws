import { z } from 'zod'
import { email, roleSchema } from './auth'
import { canonicalTimeZone, instant } from './common'

export const adminUser = z
  .object({
    id: z.uuid(),
    email: z.email(),
    role: roleSchema,
    disabledAt: instant.nullable(),
    createdAt: instant,
  })
  .strict()

export const adminUserListResponse = z.object({ users: z.array(adminUser) }).strict()

export const adminCreateUserBody = z
  .object({
    email,
    password: z.string().min(12).max(1024),
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
