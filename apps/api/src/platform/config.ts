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
  // Where this deploy is reached, `https://ctws.example.com`: the page's share tags name it in
  // full, which link previews require. Never taken from a request's Host, which anyone can set.
  PUBLIC_ORIGIN: z.string().optional(),
  // An ISO instant the whole server treats as now, for a test or acceptance stack whose "today",
  // "overdue" and "birthday in 3 days" must come out the same on every run. Never set in production.
  CLOCK_PINNED_AT: z.iso.datetime({ offset: true }).optional(),
  // Where the compose `backup` service leaves its dump; the data migration refuses to run without
  // a dump there. Unset: no data migration is attempted (a development database with no old data).
  BACKUPS_DIR: z.string().optional(),
  // A step name that makes the data migration fail on purpose, to rehearse the failure path. Never
  // set in production.
  MIGRATION_FAIL_AT: z.string().optional(),
  // What was built: the release's tag (v0.31.5) and its commit, set by the image's build. A build
  // from a working tree is `dev`.
  CTWS_VERSION: z.string().min(1).default('dev'),
  CTWS_COMMIT: z.string().optional(),
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
  /** The deploy's own origin, without a path or a trailing slash; unset leaves the share tags out. */
  publicOrigin: string | undefined
  /** The instant the server is pinned to, when it is. */
  clockPinnedAt: Date | undefined
  backupsDir: string | undefined
  migrationFailAt: string | undefined
  /** The release's tag, or `dev`. */
  version: string
  /** The commit it was built from, short, when the build knew it. */
  commit: string | undefined
}

/** `PUBLIC_ORIGIN` as an origin: http(s), a host, no path, query or fragment. */
function originOf(value: string | undefined): string | undefined {
  if (!value) return undefined
  const url = URL.parse(value)
  const bare = url && url.pathname === '/' && !url.search && !url.hash && !url.username
  if (!url || !/^https?:$/.test(url.protocol) || !bare) {
    throw new Error(
      `PUBLIC_ORIGIN must be where the app is reached and nothing more, such as ` +
        `https://ctws.example.com; got ${value}`,
    )
  }
  return url.origin
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
    publicOrigin: originOf(parsed.PUBLIC_ORIGIN),
    backupsDir: parsed.BACKUPS_DIR || undefined,
    migrationFailAt: parsed.MIGRATION_FAIL_AT || undefined,
    version: parsed.CTWS_VERSION,
    commit: parsed.CTWS_COMMIT || undefined,
  }
}
