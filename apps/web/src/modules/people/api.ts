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

async function listPeople(signal: AbortSignal): Promise<PersonResponse[]> {
  const pages = await everyPage(
    (cursor) => call(api.people.list, { query: { cursor } }, { signal }),
    signal,
  )
  return pages.flatMap((p) => p.people)
}

/** What a birthday being typed would mean; the server answers, so the lunar rules live once. */
function previewBirthday(
  draft: BirthdayDraft,
  signal: AbortSignal,
): Promise<BirthdayPreviewResponse> {
  return call(
    api.people.birthdayPreview,
    {
      query: {
        calendar: draft.calendar,
        month: draft.month,
        day: draft.day,
        ...(draft.year !== null ? { year: draft.year } : {}),
        ...(draft.leapMonth ? { leap: 'true' } : {}),
        ...(draft.hourBranch !== null ? { hour: draft.hourBranch } : {}),
      },
    },
    { signal },
  )
}

/** This module's query keys. Every one starts with `'people'`, so `all` reaches each of them. */
export const peopleKeys = {
  all: ['people'] as const,
  list: ['people', 'list'] as const,
  birthdays: ['people', 'birthdays'] as const,
  touch: ['people', 'touch'] as const,
  circles: ['people', 'circles'] as const,
  calendar: (range: { from: string; to: string }) =>
    ['people', 'calendar', range.from, range.to] as const,
  search: (q: string) => ['people', 'search', q] as const,
  birthdayPreview: (draft: BirthdayDraft) =>
    [
      'people',
      'birthday-preview',
      draft.calendar,
      draft.year,
      draft.month,
      draft.day,
      draft.leapMonth,
      draft.hourBranch,
    ] as const,
}

export const peopleQuery = () =>
  queryOptions({ queryKey: peopleKeys.list, queryFn: ({ signal }) => listPeople(signal) })

/** The birthdays page in one request: segments, month index and circle counts, all the server's. */
export const birthdaysQuery = () =>
  queryOptions({
    queryKey: peopleKeys.birthdays,
    queryFn: ({ signal }) =>
      call(api.people.birthdays, { query: { view: 'birthdays' } }, { signal }),
  })

/** Who you were in touch with lately, and with whom it has been a while (FR-060). */
export const touchQuery = () =>
  queryOptions({
    queryKey: peopleKeys.touch,
    queryFn: ({ signal }) => call(api.people.touch, { query: { view: 'touch' } }, { signal }),
  })

/** The circles, in your order, with how many people are in each. */
export const circlesQuery = () =>
  queryOptions({
    queryKey: peopleKeys.circles,
    queryFn: async ({ signal }) => (await call(api.people.circles, {}, { signal })).circles,
  })

export const birthdayCalendarQuery = (range: { from: string; to: string }) =>
  queryOptions({
    queryKey: peopleKeys.calendar(range),
    queryFn: async ({ signal }) =>
      (await call(api.people.calendar, { query: { view: 'calendar', ...range } }, { signal }))
        .entries,
  })

export const personSearchQuery = (q: string) =>
  queryOptions({
    queryKey: peopleKeys.search(q),
    queryFn: async ({ signal }) =>
      (await call(api.people.search, { query: { q } }, { signal })).people,
  })

export const birthdayPreviewQuery = (draft: BirthdayDraft) =>
  queryOptions({
    queryKey: peopleKeys.birthdayPreview(draft),
    queryFn: ({ signal }) => previewBirthday(draft, signal),
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
