import { DAY_MS } from '@ctws/contracts'
import { TZDate } from '@date-fns/tz'
// A default import, destructured: `rrule` is CommonJS, and a named import passes the tests but
// fails at startup in the bundled ESM build.
import rrulePkg from 'rrule'

const { RRule } = rrulePkg
type Rule = InstanceType<typeof RRule>

/**
 * Recurring meetings, expanded in the meeting's own zone. A weekly 09:00 in Toronto stays 09:00 in
 * Toronto across DST, so a series is stored as a wall clock plus an IANA zone, never an instant.
 * `rrule` has no zones: the wall clock goes in as if it were UTC, the rule is expanded on those
 * naive dates, and each result is read back as a wall clock in the real zone.
 */

/** A wall clock with no zone: `YYYY-MM-DDTHH:mm`. */
export type LocalTime = string

function split(local: LocalTime): [number, number, number, number, number] {
  const [date, clock] = local.split('T') as [string, string]
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const [hh, mm] = clock.split(':').map(Number) as [number, number]
  return [y, m, d, hh, mm]
}

/** The wall clock as a UTC-looking Date, the only shape `rrule` understands. */
function asNaive(local: LocalTime): Date {
  const [y, m, d, hh, mm] = split(local)
  return new Date(Date.UTC(y, m - 1, d, hh, mm))
}

const pad = (n: number) => String(n).padStart(2, '0')

function fromNaive(at: Date): LocalTime {
  return (
    `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}` +
    `T${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}`
  )
}

/**
 * The instant a wall clock names in a zone. A time skipped by spring-forward resolves to the
 * instant after the jump, as calendars do.
 */
export function instantOf(local: LocalTime, timeZone: string): Date {
  const [y, m, d, hh, mm] = split(local)
  return new Date(new TZDate(y, m - 1, d, hh, mm, 0, 0, timeZone).getTime())
}

/** The wall clock an instant shows in a zone; the inverse of `instantOf`. */
export function localOf(instant: Date, timeZone: string): LocalTime {
  const at = new TZDate(instant, timeZone)
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
    `T${pad(at.getHours())}:${pad(at.getMinutes())}`
  )
}

/** A series as stored; a null `rrule` happens once. */
export type Series = {
  startsLocal: LocalTime
  timeZone: string
  durationMinutes: number
  rrule: string | null
}

/** One occurrence, identified by the local time the rule put it at (RFC 5545's RECURRENCE-ID). */
export type Occurrence = {
  /** The series' own local time for it, before any override moved it. */
  recurrenceId: LocalTime
  /** Where it is after an override; equal to `recurrenceId` when nothing moved it. */
  startsLocal: LocalTime
  durationMinutes: number
  timeZone: string
  startsAt: Date
  endsAt: Date
}

/**
 * A bound on the work one series can cost per window, passed to the walk because `between()`
 * builds its whole array first. Measured: FREQ=SECONDLY over a month is 2.6M occurrences and 5.5 s.
 */
const HARD_LIMIT = 2000

/**
 * Limits on what one request can make the expander compute: FREQ=SECONDLY over a month costs
 * 5.5 s of one core, and COUNT=5000000 costs 3.2 s even for a window holding 31 of them.
 */
const SUB_DAILY = new Set([RRule.SECONDLY, RRule.MINUTELY, RRule.HOURLY])
const MAX_COUNT = 1000
const MAX_INTERVAL = 1000

/**
 * What is wrong with a rule for a series starting at `startsLocal`, or null. The rule is parsed
 * by the library that will expand it, never matched as a string, so the check and the expansion
 * cannot read it differently.
 */
export function ruleProblem(rule: string, startsLocal: LocalTime): string | null {
  if (!isOneLine(rule)) return 'that repeat rule cannot be read'
  let parsed: Rule
  try {
    parsed = RRule.fromString(withDtstart(rule, startsLocal))
  } catch {
    return 'that repeat rule cannot be read'
  }
  const problem = optionsProblem(parsed)
  if (problem) return problem
  const [first] = parsed.all((_, i) => i < 1)
  if (!first) return 'that repeat rule never happens'
  // RFC 5545 leaves a start the rule misses undefined, and series are found by their start.
  if (first.getTime() !== asNaive(startsLocal).getTime()) {
    return `that repeat rule does not fall on the start; it first falls on ${fromNaive(first)}`
  }
  return null
}

/** The limits, checked on a parsed rule. */
function optionsProblem(parsed: Rule): string | null {
  const { freq, interval, count } = parsed.options
  if (SUB_DAILY.has(freq)) return 'a meeting cannot repeat more often than daily'
  if (!Number.isInteger(interval) || interval < 1 || interval > MAX_INTERVAL) {
    return 'that interval is not a schedule'
  }
  if (count !== null && count !== undefined && (!Number.isInteger(count) || count > MAX_COUNT)) {
    return 'that repeats too many times'
  }
  return null
}

/**
 * An RRULE is one content line; a control character could smuggle a second property past the
 * check. A scan, because a regex over these characters is easy to get subtly wrong.
 */
const isOneLine = (value: string) =>
  value.length > 0 &&
  [...value].every((c) => {
    const code = c.codePointAt(0)!
    return code > 0x1f && code !== 0x7f
  })

function withDtstart(rule: string, startsLocal: LocalTime): string {
  const body = rule.replace(/^RRULE:/i, '')
  const [y, m, d, hh, mm] = split(startsLocal)
  const dtstart = `DTSTART:${y}${pad(m)}${pad(d)}T${pad(hh)}${pad(mm)}00Z`
  return `${dtstart}\nRRULE:${body}`
}

/** An override or cancellation of one occurrence, keyed by its RECURRENCE-ID. */
export type Exception = {
  recurrenceId: LocalTime
  cancelled: boolean
  startsLocal: LocalTime | null
  durationMinutes: number | null
}

/**
 * Every occurrence that overlaps the window (a pair of instants), exceptions applied. A meeting
 * that started before the window and runs into it is in it.
 */
export function occurrencesIn(
  series: Series,
  exceptions: readonly Exception[],
  window: { from: Date; to: Date },
): Occurrence[] {
  const byId = new Map(exceptions.map((e) => [e.recurrenceId, e]))
  const made = (recurrenceId: LocalTime): Occurrence | null => {
    const override = byId.get(recurrenceId)
    if (override?.cancelled) return null
    const startsLocal = override?.startsLocal ?? recurrenceId
    const durationMinutes = override?.durationMinutes ?? series.durationMinutes
    const startsAt = instantOf(startsLocal, series.timeZone)
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000)
    return {
      recurrenceId,
      startsLocal,
      durationMinutes,
      timeZone: series.timeZone,
      startsAt,
      endsAt,
    }
  }
  const overlaps = (o: Occurrence) =>
    o.endsAt.getTime() > window.from.getTime() && o.startsAt.getTime() < window.to.getTime()

  if (!series.rrule) {
    const one = made(series.startsLocal)
    return one && overlaps(one) ? [one] : []
  }

  // Widened by a day each way before becoming wall clocks, since the zone offset varies; the real
  // instants are filtered against the real window below.
  const fromNaiveTime = asNaive(localOf(new Date(window.from.getTime() - DAY_MS), series.timeZone))
  const toNaiveTime = asNaive(localOf(new Date(window.to.getTime() + DAY_MS), series.timeZone))

  let rule: Rule
  try {
    rule = RRule.fromString(withDtstart(series.rrule, series.startsLocal))
  } catch {
    // An unreadable stored rule shows as the one meeting its start describes.
    const one = made(series.startsLocal)
    return one && overlaps(one) ? [one] : []
  }
  // The same limits on rows stored before them or by another writer.
  if (!isOneLine(series.rrule) || optionsProblem(rule)) {
    const one = made(series.startsLocal)
    return one && overlaps(one) ? [one] : []
  }

  // The fourth argument stops the walk; `len` is how many have been collected so far.
  const naive = rule.between(fromNaiveTime, toNaiveTime, true, (_, len) => len < HARD_LIMIT)
  const out: Occurrence[] = []
  for (const at of naive) {
    const one = made(fromNaive(at))
    if (one && overlaps(one)) out.push(one)
  }
  // An override can move an occurrence into the window from outside it, where the walk never looks.
  for (const e of exceptions) {
    if (e.cancelled || !e.startsLocal) continue
    if (out.some((o) => o.recurrenceId === e.recurrenceId)) continue
    const moved = made(e.recurrenceId)
    if (moved && overlaps(moved)) out.push(moved)
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
}

/**
 * The rule with an UNTIL just before `recurrenceId`: "from here on" ends the series and starts a
 * new one, which keeps the past as it happened.
 */
export function endedBefore(rule: string, recurrenceId: LocalTime): string {
  const body = rule
    .replace(/^RRULE:/i, '')
    .split(';')
    .filter((part) => !/^(UNTIL|COUNT)=/i.test(part))
  // One minute before, in the series' naive terms: UNTIL is inclusive.
  const before = new Date(asNaive(recurrenceId).getTime() - 60_000)
  const stamp =
    `${before.getUTCFullYear()}${pad(before.getUTCMonth() + 1)}${pad(before.getUTCDate())}` +
    `T${pad(before.getUTCHours())}${pad(before.getUTCMinutes())}00Z`
  return [...body, `UNTIL=${stamp}`].join(';')
}
