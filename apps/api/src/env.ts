import { z } from 'zod'

const bool = (fallback: boolean) =>
  z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? fallback : v === 'true'))

const raw = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  AUTH_REGISTRATION: z.enum(['open', 'invite', 'closed']).default('closed'),
  AUTH_INVITE_CODE: z.string().optional(),
  COOKIE_SAMESITE: z.enum(['lax', 'none']).default('lax'),
  COOKIE_SECURE: bool(true),
  COOKIE_DOMAIN: z.string().optional(),
  // Optional: a same-origin deployment has no cross-origin clients. Empty means none are allowed.
  CORS_ORIGINS: z.string().default(''),
  // Built web app to serve (apps/web/dist). Unset or missing: the API serves no frontend.
  WEB_DIST: z.string().optional(),
})

export type Env = {
  port: number
  databaseUrl: string
  sessionTtlDays: number
  authRegistration: 'open' | 'invite' | 'closed'
  authInviteCode: string | undefined
  cookieSameSite: 'lax' | 'none'
  cookieSecure: boolean
  cookieDomain: string | undefined
  corsOrigins: string[]
  webDist: string | undefined
}

export function parseEnv(source: NodeJS.ProcessEnv | Record<string, string | undefined>): Env {
  const parsed = raw.parse(source)

  // A SameSite=None cookie without Secure is silently dropped by browsers -- login would
  // appear to "succeed" but every subsequent request would be unauthenticated. Reject this
  // at startup instead of debugging it in production.
  if (parsed.COOKIE_SAMESITE === 'none' && !parsed.COOKIE_SECURE) {
    throw new Error('SameSite=None requires Secure cookies; set COOKIE_SECURE=true')
  }
  if (parsed.AUTH_REGISTRATION === 'invite' && !parsed.AUTH_INVITE_CODE) {
    throw new Error('AUTH_INVITE_CODE is required when AUTH_REGISTRATION=invite')
  }

  return {
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    sessionTtlDays: parsed.SESSION_TTL_DAYS,
    authRegistration: parsed.AUTH_REGISTRATION,
    authInviteCode: parsed.AUTH_INVITE_CODE,
    cookieSameSite: parsed.COOKIE_SAMESITE,
    cookieSecure: parsed.COOKIE_SECURE,
    cookieDomain: parsed.COOKIE_DOMAIN || undefined,
    corsOrigins: parsed.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    webDist: parsed.WEB_DIST || undefined,
  }
}
