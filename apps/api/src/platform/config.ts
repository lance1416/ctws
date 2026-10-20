import { z } from 'zod'

/** An on/off setting, `true` or `false`, `fallback` when unset. */
export const envFlag = (fallback: boolean) =>
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
  COOKIE_SECURE: envFlag(true),
  // Built web app to serve (apps/web/dist). Unset or missing: the API serves no frontend.
  WEB_DIST: z.string().optional(),
  // An ISO instant the whole server treats as now, for a test or acceptance stack whose "today",
  // "overdue" and "birthday in 3 days" must come out the same on every run. Never set in production.
  CLOCK_PINNED_AT: z.iso.datetime({ offset: true }).optional(),
  // Where the compose `backup` service leaves its dump; the data migration refuses to run without
  // a dump there. Unset: no data migration is attempted (a development database with no old data).
  BACKUPS_DIR: z.string().optional(),
  // A step name that makes the data migration fail on purpose, to rehearse the failure path. Never
  // set in production.
  MIGRATION_FAIL_AT: z.string().optional(),
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
  /** The instant the server is pinned to, when it is. */
  clockPinnedAt: Date | undefined
  backupsDir: string | undefined
  migrationFailAt: string | undefined
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
    clockPinnedAt: parsed.CLOCK_PINNED_AT ? new Date(parsed.CLOCK_PINNED_AT) : undefined,
    authRateLimitMax: parsed.AUTH_RATE_LIMIT_MAX,
    authCeiling: parsed.AUTH_CEILING,
    cookieSecure: parsed.COOKIE_SECURE,
    webDist: parsed.WEB_DIST || undefined,
    backupsDir: parsed.BACKUPS_DIR || undefined,
    migrationFailAt: parsed.MIGRATION_FAIL_AT || undefined,
  }
}
