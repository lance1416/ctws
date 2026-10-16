import {
  type CreateMeetingBody,
  type EditScope,
  MAX_CALENDAR_SPAN_DAYS,
  type MeetingOccurrence,
  type UpdateMeetingInput,
} from '@ctws/contracts'
import { queryOptions } from '@tanstack/react-query'
import { ApiError, apiFetch, calendarOf } from '../../platform/http/api'
import { addDays, shortDay } from '../../platform/time/dates'

const BASE = '/meetings'

type DayRange = { from: string; to: string }

async function listMeetings(range: DayRange): Promise<MeetingOccurrence[]> {
  const params = new URLSearchParams(range)
  return (await apiFetch<{ meetings: MeetingOccurrence[] }>(`${BASE}?${params}`)).meetings
}

// Every key starts with `'meetings'`, so `[['meetings']]` awaits all of them, calendar included.

/** The occurrences in a range of days, in time order. */
export const meetingsQuery = (range: DayRange) =>
  queryOptions({
    queryKey: ['meetings', 'list', range.from, range.to],
    queryFn: () => listMeetings(range),
  })

/**
 * One occurrence of a series, wherever it falls now -- an evening in Toronto is the next day
 * here, and one week can be moved to another day. Null when it is cancelled or gone.
 */
export const occurrenceQuery = (meetingId: string, recurrenceId: string) =>
  queryOptions({
    queryKey: ['meetings', 'one', meetingId, recurrenceId],
    queryFn: async () => {
      const at = new URLSearchParams({ recurrenceId })
      try {
        return await apiFetch<MeetingOccurrence>(`${BASE}/${meetingId}?${at}`)
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null
        throw e
      }
    },
  })

/**
 * A series' next occurrence within a year of `today`, else its latest one in the year before:
 * a link can name a meeting long over, and a one-off in the past is the commonest such link.
 */
export const seriesQuery = (meetingId: string, today: string) =>
  queryOptions({
    queryKey: ['meetings', 'series', meetingId, today],
    queryFn: async () => {
      const ahead = await listMeetings({ from: today, to: addDays(today, MAX_CALENDAR_SPAN_DAYS) })
      const hit = ahead.find((m) => m.meetingId === meetingId)
      if (hit) return hit
      const behind = await listMeetings({
        from: addDays(today, -MAX_CALENDAR_SPAN_DAYS),
        to: today,
      })
      return [...behind].reverse().find((m) => m.meetingId === meetingId) ?? null
    },
  })

/** Calendar entries; the day, the clock and the origin zone are all the server's. */
export const meetingCalendarQuery = (range: DayRange) =>
  queryOptions({
    queryKey: ['meetings', 'calendar', range.from, range.to],
    queryFn: () => calendarOf(BASE, range),
  })

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

/** Where a new meeting lands by default: a plausible working hour, for an hour. */
export const DEFAULT_HOUR = 10
export const DEFAULT_MINUTES = 60

/** A repeat the interface offers, as its RFC string; the column holds any valid `RRULE`. */
type RepeatChoice = { value: string | null; label: string }

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

function ordinal(d: number): string {
  const teen = d % 100 >= 11 && d % 100 <= 13
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[d % 10] ?? 'th')
  return `${d}${suffix}`
}

/** What a stored rule is called; one the menu does not offer is still said in words. */
export function repeatLabel(rule: string | null, startsLocal: string, today: string): string {
  if (!rule) return 'Does not repeat'
  // The ending is said separately, so a named rule is still recognised once it has one.
  const ends = untilOf(rule)
  const tail = ends ? `, until ${shortDay(ends, today)}` : ''
  const named = repeatChoices(startsLocal).find((c) => c.value === withUntil(rule, null))
  if (named) return `${named.label}${tail}`
  const freq = /FREQ=([A-Z]+)/i.exec(rule)?.[1]?.toUpperCase()
  const unit = freq ? FREQ_NAME[freq] : undefined
  if (!unit) return `Custom${tail}`
  const every = Number(/INTERVAL=(\d+)/i.exec(rule)?.[1] ?? 1)
  // A weekly rule on several days names them: "Every week" for MO,TU,WE,TH,FR says nothing useful.
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
 * `UNTIL` is in the same naive wall-clock space as the series' start, stamped `Z`: the chosen local
 * day at 23:59:59. A real UTC instant would end the series an evening early west of Greenwich.
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
