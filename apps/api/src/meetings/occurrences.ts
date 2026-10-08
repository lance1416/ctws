import { TZDate } from '@date-fns/tz'
import { RRule } from 'rrule'

/**
 * EXPANDING A RECURRING MEETING, in the meeting's OWN time zone.
 *
 * This is the one place a calendar is usually wrong, so it is pure, it is alone in this file, and
 * it is tested without a database.
 *
 * THE RULE: a weekly meeting at 09:00 in Toronto is at 09:00 in Toronto forever. Across the DST
 * change its UTC instant moves by an hour -- the local clock is what the people in the room
 * agreed on, and the instant is derived from it. Storing the series as a UTC instant and adding
 * seven days would hold the INSTANT still and move the meeting to 08:00 or 10:00 for everyone,
 * which is the bug every hand-rolled recurrence ships.
 *
 * So a series is stored as a naive WALL CLOCK plus an IANA zone, never as an instant.
 *
 * `rrule` has no time zones of its own: it computes on UTC-looking dates. That is exactly what is
 * wanted here -- the wall clock is fed in as if it were UTC, the rule is expanded in those naive
 * terms, and each result is then read as a wall clock in the real zone. The library does the
 * calendar arithmetic (「每月最后一个周五」 and the rest of RFC 5545) and the zone is applied
 * afterwards, which is the only order that keeps the local time fixed.
 */

/** A wall clock with no zone: `YYYY-MM-DDTHH:mm`. What a series' start is stored as. */
export type LocalTime = string

const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

export function isLocalTime(value: string): boolean {
  if (!LOCAL.test(value)) return false
  const [y, m, d, hh, mm] = split(value)
  const at = new Date(Date.UTC(y, m - 1, d, hh, mm))
  return (
    at.getUTCFullYear() === y &&
    at.getUTCMonth() === m - 1 &&
    at.getUTCDate() === d &&
    at.getUTCHours() === hh &&
    at.getUTCMinutes() === mm
  )
}

function split(local: LocalTime): [number, number, number, number, number] {
  const [date, clock] = local.split('T') as [string, string]
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const [hh, mm] = clock.split(':').map(Number) as [number, number]
  return [y, m, d, hh, mm]
}

/** The wall clock as a UTC-looking Date, which is the only shape `rrule` understands. */
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
 * A wall clock in a zone, as the instant it names.
 *
 * On the hour a spring-forward skips, that wall clock does not exist; `TZDate` resolves it to the
 * instant after the jump, which is what every calendar does with a meeting booked into a gap.
 */
export function instantOf(local: LocalTime, timeZone: string): Date {
  const [y, m, d, hh, mm] = split(local)
  return new Date(new TZDate(y, m - 1, d, hh, mm, 0, 0, timeZone).getTime())
}

/** The wall clock an instant shows as, in a zone. The inverse of `instantOf`, for display. */
export function localOf(instant: Date, timeZone: string): LocalTime {
  const at = new TZDate(instant, timeZone)
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
    `T${pad(at.getHours())}:${pad(at.getMinutes())}`
  )
}

/** A series as it is stored. `rrule` null means it happens once. */
export type Series = {
  startsLocal: LocalTime
  timeZone: string
  durationMinutes: number
  rrule: string | null
}

/** One occurrence, identified by the local time the RULE put it at (RFC 5545's RECURRENCE-ID). */
export type Occurrence = {
  /** Which occurrence this is: the series' own local time for it, before any override moved it. */
  recurrenceId: LocalTime
  /** Where it actually is, after an override. Equal to `recurrenceId` when nothing moved it. */
  startsLocal: LocalTime
  durationMinutes: number
  timeZone: string
  startsAt: Date
  endsAt: Date
}

/**
 * How far ahead an endless series is expanded when nobody gives an end.
 *
 * A window always bounds the answer in practice; this only stops `RRule.all()` from being asked
 * for an infinite list if a caller ever forgets one.
 */
const HARD_LIMIT = 1000

/**
 * Checks a rule string by parsing it the way the expansion will.
 *
 * `rrule` accepts a surprising amount and throws on the rest, so this is the one place that
 * decides whether a stored rule is usable -- the API refuses what this refuses.
 */
export function isUsableRule(rule: string): boolean {
  try {
    const parsed = RRule.fromString(withDtstart(rule, '2026-01-01T00:00'))
    // A rule that produces nothing is not a schedule, it is a typo that happens to parse.
    return parsed.all((_, i) => i < 1).length > 0
  } catch {
    return false
  }
}

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
 * Every occurrence of a series that OVERLAPS the window, with exceptions applied.
 *
 * The window is a pair of instants, because that is the only zone-free way to ask: the caller
 * works in the account's calendar days and turns them into instants before getting here.
 *
 * Overlap, not containment: a meeting that started before the window and runs into it is in it.
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

  /**
   * THE WINDOW IS WIDENED BEFORE IT IS CONVERTED, by a day at each end.
   *
   * The rule is expanded on naive wall clocks, so the window has to be expressed as wall clocks
   * too -- and the offset between an instant and a wall clock is not constant (it is exactly what
   * DST changes). A day of slack is more than any zone's offset, and the real instants are
   * filtered against the real window afterwards, so the slack costs a few extra candidates and
   * can never include or drop a wrong one.
   */
  const DAY = 86_400_000
  const fromNaiveTime = asNaive(localOf(new Date(window.from.getTime() - DAY), series.timeZone))
  const toNaiveTime = asNaive(localOf(new Date(window.to.getTime() + DAY), series.timeZone))

  let rule: RRule
  try {
    rule = RRule.fromString(withDtstart(series.rrule, series.startsLocal))
  } catch {
    // A rule that no longer parses must not take the whole calendar down with it: the series is
    // reported as the one meeting its start describes.
    const one = made(series.startsLocal)
    return one && overlaps(one) ? [one] : []
  }

  const naive = rule.between(fromNaiveTime, toNaiveTime, true).slice(0, HARD_LIMIT)
  const out: Occurrence[] = []
  for (const at of naive) {
    const one = made(fromNaive(at))
    if (one && overlaps(one)) out.push(one)
  }
  /**
   * An override that MOVED an occurrence into this window from outside it would be missed by the
   * walk above, which only visits the rule's own times. They are few (one row each), so they are
   * checked directly.
   */
  for (const e of exceptions) {
    if (e.cancelled || !e.startsLocal) continue
    if (out.some((o) => o.recurrenceId === e.recurrenceId)) continue
    const moved = made(e.recurrenceId)
    if (moved && overlaps(moved)) out.push(moved)
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
}

/**
 * The rule with an `UNTIL` that stops it just before `recurrenceId`.
 *
 * This is how 「以后都改」 works: the old series is ended and a new one starts at the occurrence
 * being edited. RFC 5545 has no "change from here" -- splitting is what every calendar does, and
 * it keeps the past exactly as it happened.
 */
export function endedBefore(rule: string, recurrenceId: LocalTime): string {
  const body = rule
    .replace(/^RRULE:/i, '')
    .split(';')
    .filter((part) => !/^(UNTIL|COUNT)=/i.test(part))
  // One minute before the occurrence, in the series' own naive terms: UNTIL is inclusive.
  const before = new Date(asNaive(recurrenceId).getTime() - 60_000)
  const stamp =
    `${before.getUTCFullYear()}${pad(before.getUTCMonth() + 1)}${pad(before.getUTCDate())}` +
    `T${pad(before.getUTCHours())}${pad(before.getUTCMinutes())}00Z`
  return [...body, `UNTIL=${stamp}`].join(';')
}
