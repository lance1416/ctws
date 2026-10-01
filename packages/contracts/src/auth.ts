import { z } from 'zod'

// IANA identifiers are case-sensitive and must be recognised by the runtime.
// Intl.supportedValuesOf('timeZone') only returns canonical names (no aliases like
// Asia/Calcutta), so we validate by constructing a DateTimeFormat, then require that
// the resolved canonical name matches the input exactly (rejecting deprecated aliases
// and case variants).
export const ianaTimezone = z.string().superRefine((value, ctx) => {
  if (value !== value.trim() || value.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'timezone must not be empty or padded' })
    return
  }
  let canonical: string
  try {
    canonical = new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone
  } catch {
    ctx.addIssue({ code: 'custom', message: `unknown IANA timezone: ${value}` })
    return
  }
  if (value !== canonical) {
    ctx.addIssue({ code: 'custom', message: `timezone must be canonically cased: ${canonical}` })
  }
})

// Instance-level roles, ordered admin > maintainer > member. See apps/api/src/auth/roles.ts.
export const ROLES = ['admin', 'maintainer', 'member'] as const
export const roleSchema = z.enum(ROLES)
export type Role = z.infer<typeof roleSchema>

export const email = z.string().trim().toLowerCase().pipe(z.email().max(254))

export const registerBody = z
  .object({
    email,
    password: z.string().min(12).max(1024),
    timezone: ianaTimezone,
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

export type RegisterBody = z.infer<typeof registerBody>
export type LoginBody = z.infer<typeof loginBody>
export type UserResponse = z.infer<typeof userResponse>
