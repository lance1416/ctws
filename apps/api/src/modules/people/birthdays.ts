import type { BirthdayPreviewResponse, CalendarEntry, Circle } from '@ctws/contracts'
import {
  addDays,
  type Birthday,
  type BirthdayCalendar,
  birthdayProblem,
  factsOf,
  type Kept,
  keptNote,
  nextOccurrence,
} from '@ctws/core'
import { and, asc, isNotNull } from 'drizzle-orm'
import type { Queryable } from '../../platform/db/client'
import { accountToday } from '../../platform/db/time'
import { dayEntry } from '../../shell/calendar/entry'
import { ImpossibleBirthdayError } from './errors'
import { visiblePeople } from './queries'
import { people } from './tables'

/**
 * The birthdays page, segmented here so every client agrees. Two segments: someone whose birthday
 * has passed this year is already in `later`, for next year.
 */
export type BirthdayRow = {
  personId: string
  name: string
  circle: Circle | null
  calendar: BirthdayCalendar
  day: string
  inDays: number
  turns: number | null
  /** Only for a lunar birthday. */
  lunarDate: string | null
  kept: Kept[]
  remindLead: number
}

export type BirthdaysView = {
  today: string
  coming: BirthdayRow[]
  later: BirthdayRow[]
  /** Each person once their own lead reaches today; the workbench card draws exactly this. */
  card: BirthdayRow[]
  byMonth: Record<string, number>
  circles: Record<string, number>
}

/** The longest lead there is, and what "coming up" means on the page. */
const COMING_DAYS = 7

/** Refuses a day its year does not have, which only the calendar library knows. */
export function assertPossibleBirthday(b: Birthday): void {
  const problem = birthdayProblem(b)
  if (problem !== null) throw new ImpossibleBirthdayError(problem)
}

/** Everything derived from a birthday against today. None of it is stored. */
export function derivedFacts(b: Birthday, hourBranch: number | null, today: string) {
  const next = nextOccurrence(b, today)
  return { ...factsOf(b, hourBranch), next: { ...next, keptNote: keptNote(b, next) } }
}

/** What a birthday would mean, before it is saved. */
export function previewBirthday(
  b: Birthday,
  hourBranch: number | null,
  today: string,
): BirthdayPreviewResponse {
  assertPossibleBirthday(b)
  return derivedFacts(b, hourBranch, today)
}

async function peopleWithBirthdays(q: Queryable, workspaceId: string) {
  return q
    .select({
      id: people.id,
      name: people.name,
      circle: people.circle,
      calendar: people.birthdayCalendar,
      year: people.birthdayYear,
      month: people.birthdayMonth,
      day: people.birthdayDay,
      leapMonth: people.birthdayLeapMonth,
      hourBranch: people.birthdayHourBranch,
      remindLead: people.birthdayRemindLead,
    })
    .from(people)
    .where(and(visiblePeople(workspaceId), isNotNull(people.birthdayMonth)))
    .orderBy(asc(people.name))
}

type WithBirthday = Awaited<ReturnType<typeof peopleWithBirthdays>>[number]

/** The selected columns as core's `Birthday`; the query only returns people who have one. */
function toBirthday(p: WithBirthday): Birthday {
  return {
    calendar: p.calendar!,
    year: p.year,
    month: p.month!,
    day: p.day!,
    leapMonth: p.leapMonth,
  }
}

/**
 * Birthdays for the shell's calendar. A window across a new year can hold one person twice, so
 * the id carries the day.
 */
export async function birthdayEntries(
  q: Queryable,
  workspaceId: string,
  range: { from: string; to: string },
): Promise<CalendarEntry[]> {
  const rows = await peopleWithBirthdays(q, workspaceId)
  const entries: CalendarEntry[] = []
  for (const p of rows) {
    const birthday = toBirthday(p)
    // The window is bounded by `calendarQuery`, so this turns at most a few times.
    for (let cursor = range.from; ;) {
      const next = nextOccurrence(birthday, cursor)
      if (next.day > range.to) break
      entries.push(
        dayEntry({
          id: `${p.id}:${next.day}`,
          day: next.day,
          title: next.turns === null ? p.name : `${p.name} ${next.turns}`,
          to: `/people/${p.id}`,
          kind: 'Birthday',
          projectId: null,
          projectName: null,
        }),
      )
      cursor = addDays(next.day, 1)
    }
  }
  return entries.sort((a, b) => a.day.localeCompare(b.day) || a.title.localeCompare(b.title))
}

export async function listBirthdays(
  q: Queryable,
  workspaceId: string,
  timezone: string,
  now: Date,
): Promise<BirthdaysView> {
  const today = await accountToday(q, timezone, now)
  const rows = await peopleWithBirthdays(q, workspaceId)

  const all: BirthdayRow[] = rows.map((p) => {
    const birthday = toBirthday(p)
    const next = nextOccurrence(birthday, today)
    return {
      personId: p.id,
      name: p.name,
      circle: p.circle,
      calendar: birthday.calendar,
      day: next.day,
      inDays: next.inDays,
      turns: next.turns,
      lunarDate: factsOf(birthday, p.hourBranch).lunarDate,
      kept: next.kept,
      remindLead: p.remindLead,
    }
  })
  // Stable over the query's name order, so one day's people read alphabetically.
  all.sort((a, b) => a.inDays - b.inDays)

  const byMonth: Record<string, number> = {}
  const circles: Record<string, number> = {}
  for (const row of all) {
    const month = String(Number(row.day.slice(5, 7)))
    byMonth[month] = (byMonth[month] ?? 0) + 1
    if (row.circle) circles[row.circle] = (circles[row.circle] ?? 0) + 1
  }

  return {
    today,
    coming: all.filter((r) => r.inDays <= COMING_DAYS),
    later: all.filter((r) => r.inDays > COMING_DAYS),
    // `<=`: the lead is how early to start, not the one day to show.
    card: all.filter((r) => r.inDays <= r.remindLead),
    byMonth,
    circles,
  }
}
