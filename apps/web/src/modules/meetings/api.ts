import {
  type PersonId,
  api,
  type CreateMeetingBody,
  type MeetingOccurrence,
  type MeetingSeries,
  ruleEndDay,
  ruleEndingAt,
  type UpdateSeriesBody,
  type MeetingId,
  type NoteId,
  type NoteResponse,
} from '@ctws/contracts'
import { addDays } from '@ctws/core/day'
import { queryOptions, skipToken } from '@tanstack/react-query'
import { ApiError, call, everyPage } from '../../platform/http/api'
import { shortDay } from '../../platform/time/dates'

type DayRange = { from: string; to: string }

/**
 * Which occurrences a change to a repeating meeting reaches: this one, it and every later one, or
 * the whole series. Each is its own resource on the server.
 */
export type EditScope = 'one' | 'following' | 'all'

/** Each page is a page of series, in time order within itself; the pages are merged here. */
async function listMeetings(range: DayRange, signal: AbortSignal): Promise<MeetingOccurrence[]> {
  const pages = await everyPage(
    (cursor) => call(api.meetings.list, { query: { ...range, cursor } }, { signal }),
    signal,
  )
  return pages
    .flatMap((p) => p.meetings)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
}

/** This module's query keys. Every one starts with `'meetings'`, so `all` reaches each of them. */
export const meetingKeys = {
  all: ['meetings'] as const,
  list: (range: DayRange) => ['meetings', 'list', range.from, range.to] as const,
  occurrence: (meetingId: MeetingId | null, recurrenceId: string) =>
    ['meetings', 'one', meetingId, recurrenceId] as const,
  series: (meetingId: MeetingId | null, today: string) =>
    ['meetings', 'series', meetingId, today] as const,
  calendar: (range: DayRange) => ['meetings', 'calendar', range.from, range.to] as const,
  heldWith: (personId: PersonId) => ['meetings', 'held-with', personId] as const,
  before: (meetingId: MeetingId, day: string) => ['meetings', 'before', meetingId, day] as const,
  notes: (meetingId: MeetingId) => ['meetings', 'notes', meetingId] as const,
}

/**
 * A series' occurrences before a day, the latest first: "Earlier in this series" (FR-067), all of
 * them, however far back the series goes.
 */
export const earlierQuery = (meetingId: MeetingId, day: string) =>
  queryOptions({
    queryKey: meetingKeys.before(meetingId, day),
    queryFn: async ({ signal }) => {
      const pages = await everyPage(
        (cursor) =>
          call(
            api.meetings.occurrences,
            { params: { id: meetingId }, query: { to: addDays(day, -1), order: 'desc', cursor } },
            { signal },
          ),
        signal,
      )
      return pages.flatMap((p) => p.occurrences)
    },
  })

/** The notes hung on a series, each on its occurrence (FR-050, FR-067). */
export const seriesNotesQuery = (meetingId: MeetingId) =>
  queryOptions({
    queryKey: meetingKeys.notes(meetingId),
    queryFn: async ({ signal }) => {
      const pages = await everyPage(
        (cursor) =>
          call(api.notes.list, { query: { anchor: `meeting:${meetingId}`, cursor } }, { signal }),
        signal,
      )
      return pages.flatMap((p) => p.notes)
    },
  })

/** An occurrence's notes, written for the first time: hung on it (FR-067). */
export function writeOccurrenceNote(
  meetingId: MeetingId,
  occurrenceId: string,
  body: string,
): Promise<NoteResponse> {
  return call(api.notes.create, {
    body: { body, anchor: { type: 'meeting', id: meetingId, occurrenceId } },
  })
}

/** The rest of what is written, as it is typed. */
export function rewriteNote(id: NoteId, body: string): Promise<NoteResponse> {
  return call(api.notes.update, { params: { id }, body: { body } })
}

/** Takes back one occurrence cancelled from its More menu (FR-068). */
export function restoreOccurrence(
  meetingId: MeetingId,
  recurrenceId: string,
): Promise<MeetingOccurrence> {
  return call(api.meetings.restoreOccurrence, { params: { id: meetingId, recurrenceId } })
}

/**
 * The meetings a person was in, newest first, each series once at the last time it was held: from
 * their timeline, which the server reads back as far as it goes (FR-061, BUG-046).
 */
export const heldWithQuery = (personId: PersonId) =>
  queryOptions({
    queryKey: meetingKeys.heldWith(personId),
    queryFn: async ({ signal }) => {
      const { entries } = await call(
        api.timeline.of,
        { query: { type: 'person', id: personId, kinds: 'meeting' } },
        { signal },
      )
      const seen = new Set<string>()
      return entries.flatMap((e) => {
        if (e.kind !== 'meeting' || seen.has(e.meeting.meetingId)) return []
        seen.add(e.meeting.meetingId)
        return [
          { meetingId: e.meeting.meetingId as MeetingId, recurrenceId: e.meeting.recurrenceId },
        ]
      })
    },
  })

/** The occurrences in a range of days, in time order. */
export const meetingsQuery = (range: DayRange) =>
  queryOptions({
    queryKey: meetingKeys.list(range),
    queryFn: ({ signal }) => listMeetings(range, signal),
  })

/**
 * One occurrence of a series, wherever it falls now -- an evening in Toronto is the next day
 * here, and one week can be moved to another day. Null when it is cancelled or gone. No series,
 * no request.
 */
export const occurrenceQuery = (meetingId: MeetingId | null, recurrenceId: string) =>
  queryOptions({
    queryKey: meetingKeys.occurrence(meetingId, recurrenceId),
    queryFn:
      meetingId === null
        ? skipToken
        : ({ signal }) => readOccurrence(meetingId, recurrenceId, signal),
  })

/**
 * Whether the occurrence was cancelled from its More menu (FR-068), so it can still be taken back;
 * false when it is there, or gone for good.
 */
export const cancelledQuery = (meetingId: MeetingId | null, recurrenceId: string) =>
  queryOptions({
    queryKey: [...meetingKeys.occurrence(meetingId, recurrenceId), 'cancelled'] as const,
    queryFn:
      meetingId === null
        ? skipToken
        : async ({ signal }) => {
            try {
              await call(
                api.meetings.occurrence,
                { params: { id: meetingId, recurrenceId } },
                { signal },
              )
              return false
            } catch (e) {
              if (e instanceof ApiError && e.status === 404)
                return e.type === 'urn:ctws:problem:occurrence-cancelled'
              throw e
            }
          },
  })

/** One occurrence, or null when it is cancelled or gone. */
export async function readOccurrence(
  id: MeetingId,
  recurrenceId: string,
  signal?: AbortSignal,
): Promise<MeetingOccurrence | null> {
  try {
    return await call(api.meetings.occurrence, { params: { id, recurrenceId } }, { signal })
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

/**
 * A series' next occurrence within a year of `today`, else its latest one in the year before:
 * a link can name a meeting long over, and a one-off in the past is the commonest such link.
 * Further off than either year, a one-off still opens, and so does a series yet to start: their
 * first occurrence is then the only or the next one.
 */
export const seriesQuery = (meetingId: MeetingId | null, today: string) =>
  queryOptions({
    queryKey: meetingKeys.series(meetingId, today),
    queryFn:
      meetingId === null
        ? skipToken
        : async ({ signal }) =>
            (await nearestOccurrence(meetingId, { from: today, order: 'asc' }, signal)) ??
            (await nearestOccurrence(meetingId, { to: today, order: 'desc' }, signal)) ??
            farOccurrence(meetingId, today, signal),
  })

/** The first occurrence of a one-off, or of a series that starts after `today`; else null. */
async function farOccurrence(
  id: MeetingId,
  today: string,
  signal: AbortSignal,
): Promise<MeetingOccurrence | null> {
  let series: MeetingSeries
  try {
    series = await call(api.meetings.series, { params: { id } }, { signal })
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
  if (series.rrule !== null && series.startsLocal.slice(0, 10) <= today) return null
  return readOccurrence(id, series.startsLocal, signal)
}

/** A series' first occurrence from one end of a window, or null when it has none or is gone. */
async function nearestOccurrence(
  id: MeetingId,
  window: { from: string; order: 'asc' } | { to: string; order: 'desc' },
  signal: AbortSignal,
): Promise<MeetingOccurrence | null> {
  try {
    const { occurrences } = await call(
      api.meetings.occurrences,
      { params: { id }, query: { ...window, limit: 1 } },
      { signal },
    )
    return occurrences[0] ?? null
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

/** Calendar entries; the day, the clock and the origin zone are all the server's. */
export const meetingCalendarQuery = (range: DayRange) =>
  queryOptions({
    queryKey: meetingKeys.calendar(range),
    queryFn: async ({ signal }) =>
      (
        await everyPage(
          (cursor) =>
            call(
              api.meetings.calendar,
              { query: { view: 'calendar', ...range, cursor } },
              { signal },
            ),
          signal,
        )
      ).flatMap((p) => p.entries),
  })

export function createMeeting(body: CreateMeetingBody): Promise<MeetingOccurrence> {
  return call(api.meetings.create, { body })
}

/** Changes the whole series. */
export function patchSeries(id: MeetingId, body: UpdateSeriesBody): Promise<MeetingSeries> {
  return call(api.meetings.update, { params: { id }, body })
}

/** Moves one occurrence or changes its length. */
export function patchOccurrence(
  id: MeetingId,
  recurrenceId: string,
  body: Pick<UpdateSeriesBody, 'startsLocal' | 'durationMinutes'>,
): Promise<MeetingOccurrence> {
  return call(api.meetings.updateOccurrence, { params: { id, recurrenceId }, body })
}

/** Changes a series from one occurrence on: a new series takes over there. */
export function continueSeries(
  id: MeetingId,
  from: string,
  body: UpdateSeriesBody,
): Promise<MeetingOccurrence> {
  return call(api.meetings.continueAs, { params: { id }, body: { from, ...body } })
}

/** Cancels the series, one occurrence, or every occurrence from one on. */
export function cancelMeeting(
  id: MeetingId,
  scope: EditScope,
  recurrenceId: string,
): Promise<void> {
  if (scope === 'one') return call(api.meetings.cancelOccurrence, { params: { id, recurrenceId } })
  if (scope === 'following') {
    return call(api.meetings.cancelFrom, { params: { id }, query: { from: recurrenceId } })
  }
  return call(api.meetings.cancel, { params: { id } })
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
/**
 * A rule the menu offers, moved to the day the meeting now starts on: the same kind of repeat
 * (weekly, every other week, monthly), named after the new day. Any other rule is kept as it is.
 */
export function followStart(rule: string | null, startsLocal: string): string | null {
  if (rule === null) return null
  const [, , weekly, everyOther, monthly] = repeatChoices(startsLocal).map((c) => c.value)
  if (/^FREQ=WEEKLY;BYDAY=[A-Z]{2}$/.test(rule)) return weekly ?? rule
  if (/^FREQ=WEEKLY;INTERVAL=2;BYDAY=[A-Z]{2}$/.test(rule)) return everyOther ?? rule
  if (/^FREQ=MONTHLY;BYMONTHDAY=\d+$/.test(rule)) return monthly ?? rule
  return rule
}

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
    { value: `FREQ=WEEKLY;INTERVAL=2;BYDAY=${weekday}`, label: `Every other ${name}` },
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
  const ends = ruleEndDay(rule)
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

/** The same rule, ending on `day` (its last minute included), or never when `day` is null. */
export const withUntil = (rule: string, day: string | null): string =>
  ruleEndingAt(rule, day === null ? null : `${day}T23:59:59`)
