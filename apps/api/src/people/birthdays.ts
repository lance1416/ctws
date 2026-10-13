import type { CalendarEntry, Circle } from '@ctws/contracts'
import { factsOf, type Kept, nextOccurrence, type Birthday } from '@ctws/core'
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm'
import type { Queryable } from '../db/client'
import { people } from '../db/schema'
import { accountToday } from '../db/today'

/**
 * THE BIRTHDAYS PAGE's data, worked out in one go.
 *
 * Segmenting and ordering live here rather than in the client: two clients would each do it
 * themselves, and two answers that disagree is one person appearing twice.
 *
 * TWO SEGMENTS, NOT THREE. An "earlier this year" section would hold the same people `later`
 * already holds -- 李雷's birthday this year has gone and next year's has not arrived -- and
 * saying a row twice is the one thing a reader has to hold two of in their head (`ObjectPage`).
 * Who has just gone past is answered by the month index instead.
 */

export type BirthdayRow = {
  personId: string
  name: string
  /** The column is text with a CHECK; the union is what the wire promises. */
  circle: Circle | null
  calendar: 'solar' | 'lunar'
  day: string
  inDays: number
  turns: number | null
  /** Only for someone tracked by the lunar calendar: for everyone else it is trivia that drifts. */
  lunarDate: string | null
  /** Which fallbacks moved the day, in `@ctws/core`'s own words -- never a loose string. */
  kept: Kept[]
  remindLead: number
}

export type BirthdaysView = {
  today: string
  coming: BirthdayRow[]
  later: BirthdayRow[]
  /** The few who come TO you, each by their own lead. The workbench card draws exactly this. */
  card: BirthdayRow[]
  byMonth: Record<string, number>
  circles: Record<string, number>
}

/** Seven days: the longest lead there is, and what "coming up" means on this page. */
const COMING_DAYS = 7

/** Everyone with a birthday, with the columns it is stored in. The only read in this file. */
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
    .where(
      and(
        eq(people.workspaceId, workspaceId),
        isNull(people.deletedAt),
        isNotNull(people.birthdayMonth),
      ),
    )
    .orderBy(asc(people.name))
}

type Person = Awaited<ReturnType<typeof peopleWithBirthdays>>[number]

/** The stored columns, in the shape the arithmetic takes. */
export function birthdayOf(p: Person): Birthday {
  return {
    calendar: p.calendar as 'solar' | 'lunar',
    year: p.year,
    month: p.month as number,
    day: p.day as number,
    leapMonth: p.leapMonth,
  }
}

/**
 * THIS MODULE'S DATED THINGS, for the shell's calendar.
 *
 * A birthday has NO TIME (`time: null`) and wears no colour: colour in this app carries category
 * and urgency, and a birthday is neither. It is told apart from a meeting by leading with a name
 * and an age instead of a clock.
 *
 * One person can appear TWICE in one window (a window that spans a year), so the id carries the
 * day as well as the person.
 */
export async function listBirthdayEntries(
  q: Queryable,
  workspaceId: string,
  from: string,
  to: string,
): Promise<CalendarEntry[]> {
  const people = await peopleWithBirthdays(q, workspaceId)
  const entries: CalendarEntry[] = []
  for (const p of people) {
    const birthday = birthdayOf(p)
    let cursor = from
    // The window is bounded (`calendarQuery` refines it), so this turns at most a few times.
    for (;;) {
      const next = nextOccurrence(birthday, cursor)
      if (next.day > to) break
      entries.push({
        id: `${p.id}:${next.day}`,
        day: next.day,
        title: next.turns === null ? p.name : `${p.name} ${next.turns}`,
        to: `/people/${p.id}`,
        kind: 'Birthday',
        time: null,
        endTime: null,
        zone: null,
        projectId: null,
        projectName: null,
      })
      cursor = dayAfter(next.day)
    }
  }
  return entries.sort((a, b) => a.day.localeCompare(b.day) || a.title.localeCompare(b.title))
}

/** A calendar day plus one. Plain string arithmetic: there is no time of day here to shift. */
function dayAfter(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export async function listBirthdays(
  q: Queryable,
  workspaceId: string,
  timezone: string,
  clock: Date = new Date(),
): Promise<BirthdaysView> {
  const today = await accountToday(q, timezone, clock)
  const people = await peopleWithBirthdays(q, workspaceId)

  const all: BirthdayRow[] = people.map((p) => {
    const birthday = birthdayOf(p)
    const next = nextOccurrence(birthday, today)
    return {
      personId: p.id,
      name: p.name,
      circle: p.circle as Circle | null,
      calendar: birthday.calendar,
      day: next.day,
      inDays: next.inDays,
      turns: next.turns,
      lunarDate: factsOf(birthday, p.hourBranch).lunarDate,
      kept: next.kept,
      remindLead: p.remindLead,
    }
  })

  // The name order is already the query's, so this sort is stable: two people on one day read
  // alphabetically.
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
    // `<=`, never `===`: a person who showed up seven days out and vanished on the sixth would
    // read as a bug. The lead is how early, not which day.
    card: all.filter((r) => r.inDays <= r.remindLead),
    byMonth,
    circles,
  }
}
