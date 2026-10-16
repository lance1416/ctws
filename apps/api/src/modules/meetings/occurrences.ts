import { DAY_MS, ruleEndingAt } from '@ctws/contracts'
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
 * builds its whole array first.
 */
const HARD_LIMIT = 2000

/**
 * Limits on expanding a stored rule: FREQ=SECONDLY over a month costs 5.5 s of one core, and
 * COUNT=5000000 costs 3.2 s even for a window holding 31 of them.
 */
const SUB_DAILY = new Set([RRule.SECONDLY, RRule.MINUTELY, RRule.HOURLY])
const MAX_COUNT = 1000
const MAX_INTERVAL = 1000

const SHAPE = 'a meeting repeats daily, weekly on given days, or monthly on a date'
const SHAPE_PARTS = new Set(['dtstart', 'freq', 'interval', 'byweekday', 'bymonthday', 'until'])

/**
 * Only the repeats the editor makes are stored: daily, weekly on given days, monthly on one date,
 * any of them ended. Each falls within a month of any start; a rule that never falls, such as
 * February 30th, would be walked day by day to the year 9999 before that was known.
 */
function shapeProblem(o: Rule['origOptions']): string | null {
  if (Object.entries(o).some(([part, value]) => value != null && !SHAPE_PARTS.has(part))) {
    return SHAPE
  }
  const days = o.byweekday == null ? [] : [o.byweekday].flat()
  const plainDays = days.every((d) => typeof d !== 'object' || d.n == null)
  switch (o.freq) {
    case RRule.DAILY:
      return o.byweekday == null && o.bymonthday == null ? null : SHAPE
    case RRule.WEEKLY:
      return o.bymonthday == null && plainDays ? null : SHAPE
    case RRule.MONTHLY:
      return o.byweekday == null &&
        o.interval == null &&
        typeof o.bymonthday === 'number' &&
        o.bymonthday >= 1 &&
        o.bymonthday <= 31
        ? null
        : SHAPE
    default:
      return SHAPE
  }
}

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
  const shape = shapeProblem(parsed.origOptions)
  if (shape) return shape
  const { interval } = parsed.options
  if (!Number.isInteger(interval) || interval < 1 || interval > MAX_INTERVAL) {
    return 'that interval is not a schedule'
  }
  const [first] = parsed.all((_, i) => i < 1)
  if (!first) return 'that repeat rule never happens'
  // RFC 5545 leaves a start the rule misses undefined, and series are found by their start.
  if (first.getTime() !== asNaive(startsLocal).getTime()) {
    return `that repeat rule does not fall on the start; it first falls on ${fromNaive(first)}`
  }
  return null
}

/** Whether a stored rule is cheap to expand. */
function expandable(parsed: Rule): boolean {
  const { freq, interval, count } = parsed.options
  return (
    !SUB_DAILY.has(freq) &&
    Number.isInteger(interval) &&
    interval >= 1 &&
    interval <= MAX_INTERVAL &&
    (count == null || (Number.isInteger(count) && count <= MAX_COUNT))
  )
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

/**
 * The series' rule, ready to expand; null for a series that happens once. An unreadable stored
 * rule, or one too costly to expand (a row stored before the checks, or by another writer), is
 * also null: it shows as the one meeting its start describes.
 */
function ruleOf(series: Series): Rule | null {
  if (!series.rrule || !isOneLine(series.rrule)) return null
  let rule: Rule
  try {
    rule = RRule.fromString(withDtstart(series.rrule, series.startsLocal))
  } catch {
    return null
  }
  return expandable(rule) ? rule : null
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

  const rule = ruleOf(series)
  if (!rule) {
    const one = made(series.startsLocal)
    return one && overlaps(one) ? [one] : []
  }

  // Widened by a day each way before becoming wall clocks, since the zone offset varies; the real
  // instants are filtered against the real window below.
  const fromNaiveTime = asNaive(localOf(new Date(window.from.getTime() - DAY_MS), series.timeZone))
  const toNaiveTime = asNaive(localOf(new Date(window.to.getTime() + DAY_MS), series.timeZone))

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

/** When a series' first occurrence starts and its last one ends; null when it never stops. */
export type Bounds = { firstStartsAt: Date; lastEndsAt: Date | null }

/**
 * The span every occurrence of a series lies in, overrides included: a read skips a series whose
 * span misses its window before expanding it. Never narrower than the occurrences, since a series
 * outside it is not looked at; where the rule makes that costly to know exactly, it is wider.
 */
export function seriesBounds(series: Series, exceptions: readonly Exception[]): Bounds {
  const at = (local: LocalTime) => instantOf(local, series.timeZone)
  const endOf = (local: LocalTime, minutes: number) =>
    new Date(at(local).getTime() + minutes * 60_000)

  const rule = ruleOf(series)
  // The rule's last start: its last occurrence for a count, `UNTIL` for an end date, which no
  // start passes. A series that happens once starts and ends with its start.
  const lastStart = !rule
    ? series.startsLocal
    : rule.options.count != null
      ? fromNaive(rule.all().at(-1) ?? asNaive(series.startsLocal))
      : rule.options.until
        ? fromNaive(rule.options.until)
        : null
  let firstStartsAt = at(series.startsLocal)
  let lastEndsAt = lastStart === null ? null : endOf(lastStart, series.durationMinutes)
  for (const e of exceptions) {
    if (e.cancelled) continue
    const local = e.startsLocal ?? e.recurrenceId
    if (at(local) < firstStartsAt) firstStartsAt = at(local)
    const end = endOf(local, e.durationMinutes ?? series.durationMinutes)
    if (lastEndsAt && end > lastEndsAt) lastEndsAt = end
  }
  return { firstStartsAt, lastEndsAt }
}

/**
 * The rule with an UNTIL just before `recurrenceId`: "from here on" ends the series and starts a
 * new one, which keeps the past as it happened.
 */
export function endedBefore(rule: string, recurrenceId: LocalTime): string {
  // One minute before, in the series' naive terms: UNTIL is inclusive.
  const before = new Date(asNaive(recurrenceId).getTime() - 60_000)
  return ruleEndingAt(rule, before.toISOString().slice(0, 19))
}
