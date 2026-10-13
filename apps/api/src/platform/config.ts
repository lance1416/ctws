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
  // Register and sign-in attempts per email per minute.
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  // Sign-in requests per minute for the whole instance: 600/min ≈ 13% of one core at 13 ms per
  // refused sign-in, measured 2026-10-08 (sustained 314/s pegged 4.2 cores).
  AUTH_CEILING: z.coerce.number().int().positive().default(600),
  COOKIE_SAMESITE: z.enum(['lax', 'none']).default('lax'),
  COOKIE_SECURE: bool(true),
  COOKIE_DOMAIN: z.string().optional(),
  // Optional: a same-origin deployment has no cross-origin clients. Empty means none are allowed.
  CORS_ORIGINS: z.string().default(''),
  // Built web app to serve (apps/web/dist). Unset or missing: the API serves no frontend.
  WEB_DIST: z.string().optional(),
  // Whether a pasted link's own title is fetched: the API's only outbound request. Off, a link
  // shows its host and path. The e2e stack turns it off, since its links name real sites.
  READING_UNFURL: bool(true),
})

export type Env = {
  port: number
  databaseUrl: string
  sessionTtlDays: number
  authRegistration: 'open' | 'invite' | 'closed'
  authInviteCode: string | undefined
  authRateLimitMax: number
  authCeiling: number
  cookieSameSite: 'lax' | 'none'
  cookieSecure: boolean
  cookieDomain: string | undefined
  corsOrigins: string[]
  webDist: string | undefined
  readingUnfurl: boolean
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = raw.parse(source)

  // Browsers drop a SameSite=None cookie without Secure, so sign-in would silently not stick.
  if (parsed.COOKIE_SAMESITE === 'none' && !parsed.COOKIE_SECURE) {
    throw new Error('SameSite=None requires Secure cookies; set COOKIE_SECURE=true')
  }
  if (parsed.AUTH_REGISTRATION === 'invite' && !parsed.AUTH_INVITE_CODE) {
    throw new Error('AUTH_INVITE_CODE is required when AUTH_REGISTRATION=invite')
  }

  // Otherwise `pg` fails inside the first query with the URL redacted. The usual cause is a
  // password with unencoded URL characters.
  try {
    new URL(parsed.DATABASE_URL)
  } catch {
    throw new Error(
      'DATABASE_URL is not a valid URL. If the password contains / + = # ? @ or :, it must be ' +
        'percent-encoded, or use a URL-safe password such as `openssl rand -hex 32`.',
    )
  }

  return {
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    sessionTtlDays: parsed.SESSION_TTL_DAYS,
    authRegistration: parsed.AUTH_REGISTRATION,
    authInviteCode: parsed.AUTH_INVITE_CODE,
    authRateLimitMax: parsed.AUTH_RATE_LIMIT_MAX,
    authCeiling: parsed.AUTH_CEILING,
    cookieSameSite: parsed.COOKIE_SAMESITE,
    cookieSecure: parsed.COOKIE_SECURE,
    cookieDomain: parsed.COOKIE_DOMAIN || undefined,
    corsOrigins: parsed.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    webDist: parsed.WEB_DIST || undefined,
    readingUnfurl: parsed.READING_UNFURL,
  }
}
