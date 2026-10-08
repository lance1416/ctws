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
  // Per-IP attempts per minute on register and login. Tunable because many users can share one
  // IP (tunnel, NAT, the e2e suite).
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  /**
   * The INSTANCE-WIDE ceiling on auth requests per minute (guards.ts). Configurable for the same
   * reason `AUTH_RATE_LIMIT_MAX` is -- and because the e2e suite registers a few hundred users a
   * minute, which no production value should allow.
   */
  AUTH_CEILING: z.coerce.number().int().positive().default(60),
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
  authRateLimitMax: number
  /** The instance-wide ceiling on auth traffic; see guards.ts. */
  authCeiling: number
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

  // An unparseable DATABASE_URL otherwise surfaces far from its cause: `pg` redacts the
  // connection string and throws `ERR_INVALID_URL` from inside a query, so the stack says
  // nothing about which character broke it. The usual culprit is a password assembled into
  // the URL by a deployment template: `/`, `+`, `=`, `#` and `?` make the URL invalid, while
  // `@` and `:` parse but silently yield a different password than intended.
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
  }
}
