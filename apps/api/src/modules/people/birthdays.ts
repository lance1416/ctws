import {
  type BirthdayPreviewResponse,
  type CalendarEntry,
  type Circle,
  type PersonId,
  type WorkspaceId,
} from '@ctws/contracts'
import {
  addDays,
  type Birthday,
  birthdayProblem,
  dayIn,
  factsOf,
  type Kept,
  keptNote,
  lunarDateOf,
  nextOccurrence,
} from '@ctws/core'
import { asc, isNotNull } from 'drizzle-orm'
import type { Queryable } from '../../platform/db/client'
import { scoped, within } from '../../platform/db/scope'
import { dayEntry } from '../../shell/calendar'
import { ImpossibleBirthdayError } from './errors'
import { people } from './tables'

/**
 * The birthdays page, segmented here so every client agrees. Two segments: someone whose birthday
 * has passed this year is already in `later`, for next year.
 */
type BirthdayRow = {
  personId: PersonId
  name: string
  circle: Circle | null
  day: string
  inDays: number
  turns: number | null
  /** Only for a lunar birthday. */
  lunarDate: string | null
  kept: Kept[]
}

type BirthdaysView = {
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
  const { kept: _, ...shown } = next
  return { ...factsOf(b, hourBranch), next: { ...shown, keptNote: keptNote(b, next) } }
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

async function peopleWithBirthdays(q: Queryable, workspaceId: WorkspaceId) {
  return q
    .select({
      id: people.id,
      name: people.name,
      circle: people.circle,
      timeZone: people.timeZone,
      calendar: people.birthdayCalendar,
      year: people.birthdayYear,
      month: people.birthdayMonth,
      day: people.birthdayDay,
      leapMonth: people.birthdayLeapMonth,
      hourBranch: people.birthdayHourBranch,
      remindLead: people.birthdayRemindLead,
    })
    .from(people)
    .where(within(scoped(people, workspaceId), isNotNull(people.birthdayMonth)))
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
  workspaceId: WorkspaceId,
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
      entries.push({
        ...dayEntry({
          type: 'person',
          id: p.id,
          kind: 'birthday',
          day: next.day,
          title: p.name,
          projectId: null,
          projectName: null,
        }),
        turns: next.turns,
      })
      cursor = addDays(next.day, 1)
    }
  }
  return entries.sort((a, b) => a.day.localeCompare(b.day) || a.title.localeCompare(b.title))
}

/**
 * The birthdays page as of now. "Today", and how many days away a birthday is, are counted on
 * the person's own clock (FR-049): in Shanghai the day has begun before it has in London, and the
 * wish should go out when it begins there. The page's own `today` is the account's.
 */
export async function listBirthdays(
  q: Queryable,
  workspaceId: WorkspaceId,
  now: Date,
  accountZone: string,
): Promise<BirthdaysView> {
  const rows = await peopleWithBirthdays(q, workspaceId)
  const today = dayIn(now, accountZone)

  // The lead decides the card and is not sent.
  const all = rows.map((p): BirthdayRow & { remindLead: number } => {
    const birthday = toBirthday(p)
    const next = nextOccurrence(birthday, dayIn(now, p.timeZone ?? accountZone))
    return {
      personId: p.id,
      name: p.name,
      circle: p.circle,
      day: next.day,
      inDays: next.inDays,
      turns: next.turns,
      lunarDate: lunarDateOf(birthday),
      kept: next.kept,
      remindLead: p.remindLead,
    }
  })
  const sent = ({ remindLead: _, ...row }: (typeof all)[number]): BirthdayRow => row
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
    coming: all.filter((r) => r.inDays <= COMING_DAYS).map(sent),
    later: all.filter((r) => r.inDays > COMING_DAYS).map(sent),
    // `<=`: the lead is how early to start, not the one day to show.
    card: all.filter((r) => r.inDays <= r.remindLead).map(sent),
    byMonth,
    circles,
  }
}
