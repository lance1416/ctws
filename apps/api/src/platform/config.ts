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
  // Per-EMAIL attempts per minute on register and login: one account under attack must not lock
  // out the others, and an IP is the wrong key (a tunnel, NAT and the e2e suite all share one).
  // Tunable; `guards.ts` has why it is keyed this way and what the instance ceiling below adds.
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  /**
   * The INSTANCE-WIDE ceiling on auth requests per minute (guards.ts).
   *
   * 600, AND THAT NUMBER IS MEASURED. A rejected sign-in costs ~13 ms of CPU here (sustained
   * 314/s pegged 4.2 cores on this machine, 2026-10-08), so 600/min bounds a flood to about 13%
   * of ONE core -- the box stays usable -- while being far above anything a person does. The
   * first version of this was 60, which was a guess: it bought a further 10x reduction of
   * something already small, and paid for it in how easily an ordinary retry storm could lock
   * the owner out of signing in.
   */
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
  /** The instance-wide ceiling on auth traffic; see guards.ts. */
  authCeiling: number
  cookieSameSite: 'lax' | 'none'
  cookieSecure: boolean
  cookieDomain: string | undefined
  corsOrigins: string[]
  webDist: string | undefined
  /** 粘链接时去不去读对面的标题。关掉之后这个 API 一个出站请求都不发。 */
  readingUnfurl: boolean
}

export function parseEnv(source: Record<string, string | undefined>): Env {
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
    readingUnfurl: parsed.READING_UNFURL,
  }
}
