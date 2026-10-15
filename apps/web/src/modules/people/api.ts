import type {
  BirthdayPreviewResponse,
  BirthdaysResponse,
  CreatePersonBody,
  PersonResponse,
  RemindLead,
  UpdatePersonBody,
} from '@ctws/contracts'
import { queryOptions } from '@tanstack/react-query'
import { apiFetch, calendarOf } from '../../platform/http/api'

/** The people module's own namespace. Every query key starts with it, too. */
const BASE = '/people'

/** A birthday as the form holds it, before the server works out what it means. */
export type BirthdayDraft = {
  calendar: 'solar' | 'lunar'
  year: number | null
  month: number
  day: number
  leapMonth: boolean
  hourBranch: number | null
  remindLead: RemindLead
}

async function listPeople(): Promise<PersonResponse[]> {
  return (await apiFetch<{ people: PersonResponse[] }>(BASE)).people
}

async function searchPeople(query: string): Promise<PersonResponse[]> {
  const path = `${BASE}/search?q=${encodeURIComponent(query)}`
  return (await apiFetch<{ people: PersonResponse[] }>(path)).people
}

/**
 * What this birthday WOULD mean, while it is being typed. The server answers, so the lunar rules
 * have one implementation and the browser never loads the library that decides them.
 */
function previewBirthday(draft: BirthdayDraft): Promise<BirthdayPreviewResponse> {
  const params = new URLSearchParams({
    calendar: draft.calendar,
    month: String(draft.month),
    day: String(draft.day),
  })
  if (draft.year !== null) params.set('year', String(draft.year))
  if (draft.leapMonth) params.set('leap', 'true')
  if (draft.hourBranch !== null) params.set('hour', String(draft.hourBranch))
  return apiFetch(`${BASE}/birthdays/preview?${params}`)
}

export const peopleQuery = () => queryOptions({ queryKey: ['people', 'list'], queryFn: listPeople })

/** The birthdays page in one request: segments, month index and circle counts, all the server's. */
export const birthdaysQuery = () =>
  queryOptions({
    queryKey: ['people', 'birthdays'],
    queryFn: (): Promise<BirthdaysResponse> => apiFetch(`${BASE}/birthdays`),
  })

/** This module's dated things, for the shell's grid. */
export const birthdayCalendarQuery = (range: { from: string; to: string }) =>
  queryOptions({
    queryKey: ['people', 'calendar', range.from, range.to],
    queryFn: () => calendarOf(BASE, range),
  })

export const personSearchQuery = (q: string) =>
  queryOptions({ queryKey: ['people', 'search', q], queryFn: () => searchPeople(q) })

export const birthdayPreviewQuery = (draft: BirthdayDraft) =>
  queryOptions({
    queryKey: [
      'people',
      'birthday-preview',
      draft.calendar,
      draft.year,
      draft.month,
      draft.day,
      draft.leapMonth,
      draft.hourBranch,
    ],
    queryFn: () => previewBirthday(draft),
  })

export function createPerson(body: CreatePersonBody): Promise<PersonResponse> {
  return apiFetch(BASE, { method: 'POST', body: JSON.stringify(body) })
}

export function patchPerson(id: string, body: UpdatePersonBody): Promise<PersonResponse> {
  return apiFetch(`${BASE}/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function deletePerson(id: string): Promise<void> {
  return apiFetch(`${BASE}/${id}`, { method: 'DELETE' })
}
