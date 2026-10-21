import { addDays } from '../day'

/**
 * A DAY TYPED ANY WAY (FR-034): "Oct 29", "29 Oct", "29/10", "2026-10-29", "tomorrow", "fri",
 * "next week", "in 3 days". Returns `YYYY-MM-DD`, or null for words that are not a day or a day
 * that does not exist. `today` is given, never read from the clock. A month and day without a
 * year are the next such day from today, this year or next.
 */
export function parseDay(text: string, today: string): string | null {
  const t = text.trim().toLocaleLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ')
  if (t === '') return null
  if (t === 'today') return today
  if (t === 'tomorrow' || t === 'tmr') return addDays(today, 1)
  if (t === 'yesterday') return addDays(today, -1)
  if (t === 'next week') return nextMonday(today)
  const inDays = /^in (\d{1,3}) days?$/.exec(t)
  if (inDays) return addDays(today, Number(inDays[1]))
  const weekday = weekdayOf(t.replace(/^(this|next) /, ''))
  if (weekday !== null) return nextWeekday(today, weekday, t.startsWith('next '))

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
  if (iso) return dayOf(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  // Day first, as the dates on this side of the Atlantic are written.
  const numeric = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(t)
  if (numeric) {
    const year = numeric[3] === undefined ? null : fullYear(Number(numeric[3]))
    return withYear(Number(numeric[2]), Number(numeric[1]), year, today)
  }
  const monthFirst = /^([a-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?$/.exec(t)
  const dayFirst = /^(\d{1,2})(?:st|nd|rd|th)? ([a-z]{3,9})\.?(?: (\d{4}))?$/.exec(t)
  const m = monthFirst
    ? { month: monthOf(monthFirst[1]!), day: Number(monthFirst[2]), year: monthFirst[3] }
    : dayFirst
      ? { month: monthOf(dayFirst[2]!), day: Number(dayFirst[1]), year: dayFirst[3] }
      : null
  if (m && m.month !== null)
    return withYear(m.month, m.day, m.year === undefined ? null : Number(m.year), today)
  return null
}

/** A month typed any way: "Mar 2023", "2023-03", "03/2023", "March". Returns `YYYY-MM`. */
export function parseMonth(text: string, today: string): string | null {
  const t = text.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
  if (t === '') return null
  if (t === 'now' || t === 'this month') return today.slice(0, 7)
  const iso = /^(\d{4})-(\d{1,2})$/.exec(t)
  if (iso) return monthOfYear(Number(iso[1]), Number(iso[2]))
  const numeric = /^(\d{1,2})[/.-](\d{4})$/.exec(t)
  if (numeric) return monthOfYear(Number(numeric[2]), Number(numeric[1]))
  const named = /^([a-z]{3,9})\.?(?: (\d{4}))?$/.exec(t)
  if (named) {
    const month = monthOf(named[1]!)
    if (month === null) return null
    return monthOfYear(named[2] === undefined ? Number(today.slice(0, 4)) : Number(named[2]), month)
  }
  return null
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** 1 to 12 for a month name or a prefix of at least three letters; null otherwise. */
function monthOf(word: string): number | null {
  if (word.length < 3) return null
  const at = MONTHS.findIndex((m) => m.startsWith(word))
  return at === -1 ? null : at + 1
}

/** 0 (Sunday) to 6 for a weekday name or a prefix of at least three letters; null otherwise. */
function weekdayOf(word: string): number | null {
  if (word.length < 3 || word.length > 9) return null
  const at = WEEKDAYS.findIndex((d) => d.startsWith(word))
  return at === -1 ? null : at
}

/** The Monday after today. */
function nextMonday(today: string): string {
  const now = new Date(`${today}T00:00:00Z`).getUTCDay()
  return addDays(today, (1 - now + 7) % 7 || 7)
}

/** The coming such weekday, today included; `after` skips to the one after that. */
function nextWeekday(today: string, weekday: number, after: boolean): string {
  const now = new Date(`${today}T00:00:00Z`).getUTCDay()
  let ahead = (weekday - now + 7) % 7
  if (after && ahead === 0) ahead = 7
  else if (after) ahead += 7
  return addDays(today, ahead)
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function dayOf(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function monthOfYear(year: number, month: number): string | null {
  if (month < 1 || month > 12 || year < 1 || year > 9999) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
}

/** With no year given, the next such day from today: this year, or next year once it has passed. */
function withYear(month: number, day: number, year: number | null, today: string): string | null {
  if (year !== null) return dayOf(year, month, day)
  const thisYear = Number(today.slice(0, 4))
  const candidate = dayOf(thisYear, month, day)
  if (candidate === null) {
    // 29 Feb in a year without one: the next year that has it.
    for (let y = thisYear + 1; y <= thisYear + 8; y++) {
      const next = dayOf(y, month, day)
      if (next !== null) return next
    }
    return null
  }
  return candidate >= today ? candidate : (dayOf(thisYear + 1, month, day) ?? candidate)
}

/** A two-digit year is this century's. */
function fullYear(y: number): number {
  return y < 100 ? 2000 + y : y
}
