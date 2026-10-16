import {
  api,
  type BirthdayPreviewResponse,
  type CreatePersonBody,
  type PersonResponse,
  type RemindLead,
  type UpdatePersonBody,
  type PersonId,
} from '@ctws/contracts'
import { queryOptions } from '@tanstack/react-query'
import { call, everyPage } from '../../platform/http/api'

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
  const pages = await everyPage((cursor) => call(api.people.list, { query: { cursor } }))
  return pages.flatMap((p) => p.people)
}

async function searchPeople(q: string): Promise<PersonResponse[]> {
  return (await call(api.people.search, { query: { q } })).people
}

/** What a birthday being typed would mean; the server answers, so the lunar rules live once. */
function previewBirthday(draft: BirthdayDraft): Promise<BirthdayPreviewResponse> {
  return call(api.people.birthdayPreview, {
    query: {
      calendar: draft.calendar,
      month: draft.month,
      day: draft.day,
      ...(draft.year !== null ? { year: draft.year } : {}),
      ...(draft.leapMonth ? { leap: 'true' } : {}),
      ...(draft.hourBranch !== null ? { hour: draft.hourBranch } : {}),
    },
  })
}

export const peopleQuery = () => queryOptions({ queryKey: ['people', 'list'], queryFn: listPeople })

/** The birthdays page in one request: segments, month index and circle counts, all the server's. */
export const birthdaysQuery = () =>
  queryOptions({
    queryKey: ['people', 'birthdays'],
    queryFn: () => call(api.people.birthdays, { query: { view: 'birthdays' } }),
  })

export const birthdayCalendarQuery = (range: { from: string; to: string }) =>
  queryOptions({
    queryKey: ['people', 'calendar', range.from, range.to],
    queryFn: async () =>
      (await call(api.people.calendar, { query: { view: 'calendar', ...range } })).entries,
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
  return call(api.people.create, { body })
}

export function patchPerson(id: PersonId, body: UpdatePersonBody): Promise<PersonResponse> {
  return call(api.people.update, { params: { id }, body })
}

export function deletePerson(id: PersonId): Promise<void> {
  return call(api.people.remove, { params: { id } })
}
