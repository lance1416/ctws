import type { Circle } from '@ctws/contracts'
import { factsOf, nextOccurrence, type Birthday } from '@ctws/core'
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm'
import type { Queryable } from '../db/client'
import { contacts } from '../db/schema'
import { accountToday } from '../db/today'

/**
 * THE BIRTHDAYS PAGE's data, worked out in one go.
 *
 * Segmenting and ordering live here rather than in the client for the reason the design spec gives
 * (section 8.4): two clients would each do it themselves, and two answers that disagree is one
 * person appearing twice.
 *
 * TWO SEGMENTS, NOT THREE. An "earlier this year" section would hold the same people `later`
 * already holds -- 李雷's birthday this year has gone and next year's has not arrived -- and
 * saying a row twice is the one thing a reader has to hold two of in their head (`ObjectPage`).
 * Who has just gone past is answered by the month index instead.
 */

export type BirthdayRow = {
  contactId: string
  name: string
  /** The column is text with a CHECK; the union is what the wire promises. */
  circle: Circle | null
  calendar: 'solar' | 'lunar'
  day: string
  inDays: number
  turns: number | null
  /** Only for someone tracked by the lunar calendar: for everyone else it is trivia that drifts. */
  lunarDate: string | null
  kept: string[]
  remindLead: number
}

export type BirthdaysView = {
  today: string
  coming: BirthdayRow[]
  later: BirthdayRow[]
  byMonth: Record<string, number>
  circles: Record<string, number>
}

/** Seven days: the longest lead there is, and what "coming up" means on this page. */
const COMING_DAYS = 7

/** Everyone with a birthday, with the columns it is stored in. The only read in this file. */
async function peopleWithBirthdays(q: Queryable, workspaceId: string) {
  return q
    .select({
      id: contacts.id,
      name: contacts.name,
      circle: contacts.circle,
      calendar: contacts.birthdayCalendar,
      year: contacts.birthdayYear,
      month: contacts.birthdayMonth,
      day: contacts.birthdayDay,
      leapMonth: contacts.birthdayLeapMonth,
      hourBranch: contacts.birthdayHourBranch,
      remindLead: contacts.birthdayRemindLead,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        isNull(contacts.deletedAt),
        isNotNull(contacts.birthdayMonth),
      ),
    )
    .orderBy(asc(contacts.name))
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
      contactId: p.id,
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
    byMonth,
    circles,
  }
}
