import type {
  CalendarEntry,
  CreateMeetingBody,
  EditScope,
  MeetingOccurrence,
  UpdateMeetingInput,
} from '@ctws/contracts'
import { apiFetch } from '../api'

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
export async function meetingCalendar(range: {
  from: string
  to: string
}): Promise<CalendarEntry[]> {
  const path = `${BASE}/calendar?from=${range.from}&to=${range.to}`
  return (await apiFetch<{ entries: CalendarEntry[] }>(path)).entries
}

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
  const named = repeatChoices(startsLocal).find((c) => c.value === rule)
  if (named) return named.label
  const freq = /FREQ=([A-Z]+)/i.exec(rule)?.[1]?.toUpperCase()
  const unit = freq ? FREQ_NAME[freq] : undefined
  if (!unit) return 'Custom'
  const every = Number(/INTERVAL=(\d+)/i.exec(rule)?.[1] ?? 1)
  // A weekly rule that names its days SAYS them: "Every week" for MO,TU,WE,TH,FR is true of the
  // rule and useless about the meeting, which is the one thing the row is there to say.
  const byDay = /BYDAY=([A-Z,]+)/i.exec(rule)?.[1]
  if (freq === 'WEEKLY' && byDay && byDay.includes(',')) {
    const named = byDay
      .split(',')
      .map((d) => DAY_NAME[d.trim().toUpperCase()])
      .filter(Boolean)
    if (named.length > 0) return `Weekly on ${named.join(', ')}`
  }
  return every > 1 ? `Every ${every} ${unit}s` : `Every ${unit}`
}
