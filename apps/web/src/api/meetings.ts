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
const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'] as const

/** The choices for a meeting starting on `startsLocal`, named after the day it falls on. */
export function repeatChoices(startsLocal: string): RepeatChoice[] {
  const [date] = startsLocal.split('T') as [string]
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const at = new Date(Date.UTC(y, m - 1, d))
  const weekday = WEEKDAYS[at.getUTCDay()]!
  const name = WEEKDAY_NAMES[at.getUTCDay()]!
  return [
    { value: null, label: '不重复' },
    { value: 'FREQ=DAILY', label: '每天' },
    { value: `FREQ=WEEKLY;BYDAY=${weekday}`, label: `每周${name}` },
    { value: `FREQ=WEEKLY;INTERVAL=2;BYDAY=${weekday}`, label: `每两周的周${name}` },
    { value: `FREQ=MONTHLY;BYMONTHDAY=${d}`, label: `每月 ${d} 号` },
  ]
}

const FREQ_NAME: Record<string, string> = {
  DAILY: '天',
  WEEKLY: '周',
  MONTHLY: '月',
  YEARLY: '年',
}

/**
 * What a stored rule is CALLED.
 *
 * A rule the menu does not name is still said in words rather than shown as `FREQ=WEEKLY`: the
 * column accepts rules this interface does not offer, and an RFC string on screen is the data
 * model leaking into the page.
 */
export function repeatLabel(rule: string | null, startsLocal: string): string {
  if (!rule) return '不重复'
  const named = repeatChoices(startsLocal).find((c) => c.value === rule)
  if (named) return named.label
  const freq = /FREQ=([A-Z]+)/i.exec(rule)?.[1]?.toUpperCase()
  const unit = freq ? FREQ_NAME[freq] : undefined
  if (!unit) return '按规则重复'
  const every = Number(/INTERVAL=(\d+)/i.exec(rule)?.[1] ?? 1)
  return every > 1 ? `每 ${every} ${unit}` : `每${unit}`
}
