import { z } from 'zod'
import { email, ianaTimezone, roleSchema } from './auth'

export const adminUser = z
  .object({
    id: z.uuid(),
    email: z.email(),
    role: roleSchema,
    disabledAt: z.iso.datetime({ offset: true }).nullable(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict()

export const adminUserListResponse = z.object({ users: z.array(adminUser) }).strict()

export const adminCreateUserBody = z
  .object({
    email,
    password: z.string().min(12).max(1024),
    timezone: ianaTimezone,
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

export const adminUserParams = z.object({ id: z.uuid() }).strict()

export type AdminUser = z.infer<typeof adminUser>
export type AdminCreateUserBody = z.infer<typeof adminCreateUserBody>
export type AdminUpdateUserBody = z.infer<typeof adminUpdateUserBody>
