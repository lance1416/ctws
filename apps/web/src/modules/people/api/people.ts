import type {
  BirthdayPreviewResponse,
  PersonResponse,
  RemindLead,
  CreatePersonBody,
  UpdatePersonBody,
} from '@ctws/contracts'
import { apiFetch } from '../../../platform/http/api'

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

/**
 * What this birthday WOULD mean, while it is being typed. The server answers, so the lunar rules
 * have one implementation and the browser never pays for the 750 KB library that decides them.
 */
export function previewBirthday(draft: BirthdayDraft): Promise<BirthdayPreviewResponse> {
  const params = new URLSearchParams({
    calendar: draft.calendar,
    month: String(draft.month),
    day: String(draft.day),
  })
  if (draft.year !== null) params.set('year', String(draft.year))
  if (draft.leapMonth) params.set('leap', 'true')
  if (draft.hourBranch !== null) params.set('hour', String(draft.hourBranch))
  return apiFetch(`/people/birthdays/preview?${params}`)
}

/** The people module's own namespace. */
const BASE = '/people'

export type PeopleQuery = { projectId?: string; unfiled?: boolean }

export const peopleKey = (query: PeopleQuery = {}) =>
  ['people', query.projectId ?? null, query.unfiled ?? false] as const

export async function listPeople(query: PeopleQuery = {}): Promise<PersonResponse[]> {
  const params = new URLSearchParams()
  if (query.projectId) params.set('projectId', query.projectId)
  if (query.unfiled) params.set('unfiled', 'true')
  const suffix = params.size > 0 ? `?${params}` : ''
  return (await apiFetch<{ people: PersonResponse[] }>(`${BASE}${suffix}`)).people
}

export async function searchPeople(query: string): Promise<PersonResponse[]> {
  const path = `${BASE}/search?q=${encodeURIComponent(query)}`
  return (await apiFetch<{ people: PersonResponse[] }>(path)).people
}

export function createPerson(body: CreatePersonBody): Promise<PersonResponse> {
  return apiFetch(BASE, { method: 'POST', body: JSON.stringify(body) })
}

export function patchPerson(id: string, body: UpdatePersonBody): Promise<PersonResponse> {
  return apiFetch(`${BASE}/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function deletePerson(id: string): Promise<void> {
  return apiFetch(`${BASE}/${id}`, { method: 'DELETE' })
}

/**
 * How a channel is OPENED. `mailto:` and `tel:` are what a person list is for -- a person looks
 * someone up in order to write to them, and making them copy the address by hand is the whole
 * cost the list was supposed to remove.
 */
export function channelHref(kind: string, value: string): string | null {
  if (kind === 'email') return `mailto:${value}`
  // Spaces and dashes are how a person writes a number and not how a dialler takes one.
  if (kind === 'phone') return `tel:${value.replace(/[\s-]/g, '')}`
  if (kind === 'url') return /^https?:\/\//i.test(value) ? value : `https://${value}`
  return null
}
