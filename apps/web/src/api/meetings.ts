import type {
  CalendarEntry,
  CreateMeetingBody,
  EditScope,
  MeetingOccurrence,
  UpdateMeetingInput,
} from '@ctws/contracts'
import { apiFetch, calendarOf } from '../api'
import { MONTHS } from '../dueAt'

/** The meetings module's own namespace. */
const BASE = '/meetings'

export type MeetingQuery = { projectId?: string; from?: string; to?: string }

export const meetingsKey = (query: MeetingQuery = {}) =>
  ['meetings', query.projectId ?? null, query.from ?? null, query.to ?? null] as const

export async function listMeetings(query: MeetingQuery = {}): Promise<MeetingOccurrence[]> {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) if (v) params.set(k, v)
  const suffix = params.size > 0 ? `?${params}` : ''
  return (await apiFetch<{ meetings: MeetingOccurrence[] }>(`${BASE}${suffix}`)).meetings
}

/** This module's dated things. The day, the clock and the origin zone are all the server's. */
export const meetingCalendar = (range: { from: string; to: string }) => calendarOf(BASE, range)

export function createMeeting(body: CreateMeetingBody): Promise<MeetingOccurrence> {
  return apiFetch(BASE, { method: 'POST', body: JSON.stringify(body) })
}

export function patchMeeting(id: string, body: UpdateMeetingInput): Promise<MeetingOccurrence> {
  return apiFetch(`${BASE}/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function cancelMeeting(
  id: string,
  opts: { scope: EditScope; recurrenceId?: string },
): Promise<void> {
  const params = new URLSearchParams({ scope: opts.scope })
  if (opts.recurrenceId) params.set('recurrenceId', opts.recurrenceId)
  return apiFetch(`${BASE}/${id}?${params}`, { method: 'DELETE' })
}

/** The default a meeting made by clicking a day lands on: a plausible working hour, for an hour. */
export const DEFAULT_HOUR = 10
export const DEFAULT_MINUTES = 60

/**
 * THE REPEATS THE INTERFACE OFFERS, as the RFC strings they are.
 *
 * A small list, because these are the ones a person actually schedules; the column holds any
 * valid `RRULE`, so a rule this list does not name costs nothing in the data when it is wanted.
 */
export type RepeatChoice = { value: string | null; label: string }

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const
const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

/** The choices for a meeting starting on `startsLocal`, named after the day it falls on. */
export function repeatChoices(startsLocal: string): RepeatChoice[] {
  const [date] = startsLocal.split('T') as [string]
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const at = new Date(Date.UTC(y, m - 1, d))
  const weekday = WEEKDAYS[at.getUTCDay()]!
  const name = WEEKDAY_NAMES[at.getUTCDay()]!
  return [
    { value: null, label: 'Does not repeat' },
    { value: 'FREQ=DAILY', label: 'Daily' },
    { value: `FREQ=WEEKLY;BYDAY=${weekday}`, label: `Weekly on ${name}` },
    { value: `FREQ=WEEKLY;INTERVAL=2;BYDAY=${weekday}`, label: `Every two weeks on ${name}` },
    { value: `FREQ=MONTHLY;BYMONTHDAY=${d}`, label: `Monthly on the ${ordinal(d)}` },
  ]
}

/** `BYDAY`'s two-letter codes, as a person says them. */
const DAY_NAME: Record<string, string> = {
  MO: 'Mon',
  TU: 'Tue',
  WE: 'Wed',
  TH: 'Thu',
  FR: 'Fri',
  SA: 'Sat',
  SU: 'Sun',
}

const FREQ_NAME: Record<string, string> = {
  DAILY: 'day',
  WEEKLY: 'week',
  MONTHLY: 'month',
  YEARLY: 'year',
}

/** "Dec 31", or "Dec 31, 2027" when it is not this year -- the same shape every date here takes. */
function shortDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const short = `${MONTHS[m - 1]} ${d}`
  return y === new Date().getFullYear() ? short : `${short}, ${y}`
}

/** 1st, 2nd, 3rd, 4th -- for the day of the month a monthly rule falls on. */
function ordinal(d: number): string {
  const teen = d % 100 >= 11 && d % 100 <= 13
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[d % 10] ?? 'th')
  return `${d}${suffix}`
}

/**
 * What a stored rule is CALLED.
 *
 * A rule the menu does not name is still said in words rather than shown as `FREQ=WEEKLY`: the
 * column accepts rules this interface does not offer, and an RFC string on screen is the data
 * model leaking into the page.
 */
export function repeatLabel(rule: string | null, startsLocal: string): string {
  if (!rule) return 'Does not repeat'
  // The ending is said separately, so a named rule is still recognised once it has one.
  const ends = untilOf(rule)
  const tail = ends ? `, until ${shortDay(ends)}` : ''
  const named = repeatChoices(startsLocal).find((c) => c.value === withUntil(rule, null))
  if (named) return `${named.label}${tail}`
  const freq = /FREQ=([A-Z]+)/i.exec(rule)?.[1]?.toUpperCase()
  const unit = freq ? FREQ_NAME[freq] : undefined
  if (!unit) return `Custom${tail}`
  const every = Number(/INTERVAL=(\d+)/i.exec(rule)?.[1] ?? 1)
  // A weekly rule that names its days SAYS them: "Every week" for MO,TU,WE,TH,FR is true of the
  // rule and useless about the meeting, which is the one thing the row is there to say.
  const byDay = /BYDAY=([A-Z,]+)/i.exec(rule)?.[1]
  if (freq === 'WEEKLY' && byDay && byDay.includes(',')) {
    const named = byDay
      .split(',')
      .map((d) => DAY_NAME[d.trim().toUpperCase()])
      .filter(Boolean)
    if (named.length > 0) return `Weekly on ${named.join(', ')}${tail}`
  }
  return `${every > 1 ? `Every ${every} ${unit}s` : `Every ${unit}`}${tail}`
}

/**
 * WHEN A REPEAT STOPS.
 *
 * `UNTIL` is stored in the SAME naive space as the series' own start (`occurrences.ts` builds
 * `DTSTART` from the wall clock and stamps it `Z`, then converts the results into the meeting's
 * zone afterwards). So the stamp here is the chosen LOCAL day at 23:59:59 with a `Z` on it: it
 * means "through the end of that day where the meeting is", which is what a person picking a
 * date means. A real UTC instant would end the series an evening early for anybody west of
 * Greenwich.
 */
const UNTIL = /;?UNTIL=\d{8}T\d{6}Z/i

/** The day a rule stops on, as `YYYY-MM-DD`, or null when it never does. */
export function untilOf(rule: string | null): string | null {
  const found = rule?.match(/UNTIL=(\d{4})(\d{2})(\d{2})T\d{6}Z/i)
  return found ? `${found[1]}-${found[2]}-${found[3]}` : null
}

/** The same rule, ending on `day` -- or never, when `day` is null. */
export function withUntil(rule: string, day: string | null): string {
  const bare = rule.replace(UNTIL, '')
  if (!day) return bare
  const [y, m, d] = day.split('-') as [string, string, string]
  return `${bare};UNTIL=${y}${m}${d}T235959Z`
}
