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
  AUTH_REGISTRATION: z.enum(['open', 'closed']).default('closed'),
  // Register and sign-in attempts per email per minute.
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  // Sign-in requests per minute for the whole instance.
  AUTH_CEILING: z.coerce.number().int().positive().default(600),
  COOKIE_SECURE: bool(true),
  // Built web app to serve (apps/web/dist). Unset or missing: the API serves no frontend.
  WEB_DIST: z.string().optional(),
  // Whether a pasted link's own title is fetched: the API's only outbound request. Off, a link
  // shows its host and path.
  READING_UNFURL: bool(true),
})

export type Env = {
  port: number
  databaseUrl: string
  sessionTtlDays: number
  authRegistration: 'open' | 'closed'
  authRateLimitMax: number
  authCeiling: number
  cookieSecure: boolean
  webDist: string | undefined
  readingUnfurl: boolean
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = raw.parse(source)

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
    authRateLimitMax: parsed.AUTH_RATE_LIMIT_MAX,
    authCeiling: parsed.AUTH_CEILING,
    cookieSecure: parsed.COOKIE_SECURE,
    webDist: parsed.WEB_DIST || undefined,
    readingUnfurl: parsed.READING_UNFURL,
  }
}
