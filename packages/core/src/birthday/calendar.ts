import { LunarDay, LunarMonth, LunarYear, SolarDay } from 'tyme4ts'
import { HOUR_BRANCHES, LUNAR_DAYS, LUNAR_MONTHS } from './names'

/**
 * Birthday arithmetic on calendar days; "today" is passed in. Lunar dates need per-year month
 * lengths and leap months, which `tyme4ts` (MIT) knows.
 *
 * When a year lacks the day, the app keeps it earlier, never later, and says so (`Kept`):
 *   - born in a leap month: in a year without it, the ordinary month of that number;
 *   - born on a lunar 30th: in a 29-day month, the 29th;
 *   - born on 29 February: in a common year, the 28th.
 */

export type BirthdayCalendar = 'solar' | 'lunar'

/** A birthday in the calendar it was given in; `year` is null when unknown. */
export type Birthday = {
  calendar: BirthdayCalendar
  year: number | null
  month: number
  day: number
  /** Lunar only. */
  leapMonth: boolean
}

/** Why this year's day moved. */
export type Kept = 'leap-month' | 'short-month' | 'short-february'

type BirthdayOccurrence = {
  /** The next birthday, a calendar day. */
  day: string
  /** 0 is today. */
  inDays: number
  /** The age reached that day, by lunar year for a lunar birthday; null without a year. */
  turns: number | null
  /** Both may apply at once (a leap 6th month's 30th). */
  kept: Kept[]
}

const iso = (d: SolarDay): string =>
  `${d.getYear()}-${String(d.getMonth()).padStart(2, '0')}-${String(d.getDay()).padStart(2, '0')}`

const parseDay = (day: string): SolarDay => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return SolarDay.fromYmd(y, m, d)
}

/** Days between two calendar days; UTC arithmetic, since there is no time of day. */
const daysBetween = (from: SolarDay, to: SolarDay): number =>
  Math.round(
    (Date.UTC(to.getYear(), to.getMonth() - 1, to.getDay()) -
      Date.UTC(from.getYear(), from.getMonth() - 1, from.getDay())) /
      86_400_000,
  )

const isLeapYear = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

export function nextOccurrence(b: Birthday, today: string): BirthdayOccurrence {
  const from = parseDay(today)
  return b.calendar === 'solar' ? nextSolar(b, from) : nextLunar(b, from)
}

function nextSolar(b: Birthday, from: SolarDay): BirthdayOccurrence {
  for (let y = from.getYear(); y <= from.getYear() + 1; y++) {
    const kept: Kept[] = []
    let day = b.day
    if (b.month === 2 && b.day === 29 && !isLeapYear(y)) {
      day = 28
      kept.push('short-february')
    }
    const cand = SolarDay.fromYmd(y, b.month, day)
    const inDays = daysBetween(from, cand)
    if (inDays >= 0) {
      return { day: iso(cand), inDays, turns: b.year === null ? null : y - b.year, kept }
    }
  }
  throw new Error('a solar anniversary recurs every year')
}

function nextLunar(b: Birthday, from: SolarDay): BirthdayOccurrence {
  const startYear = from.getLunarDay().getLunarMonth().getLunarYear().getYear()
  // A leap month recurs within three lunar years; a short month never changes the year.
  for (let y = startYear; y <= startYear + 2; y++) {
    const kept: Kept[] = []
    let month = b.month
    if (b.leapMonth) {
      if (LunarYear.fromYear(y).getLeapMonth() === b.month) month = -b.month
      else kept.push('leap-month')
    }
    let day = b.day
    const length = LunarMonth.fromYm(y, month).getDayCount()
    if (day > length) {
      day = length
      kept.push('short-month')
    }
    const cand = LunarDay.fromYmd(y, month, day).getSolarDay()
    const inDays = daysBetween(from, cand)
    if (inDays >= 0) {
      // By lunar year: a 12th-month birthday falls in the next solar year.
      return { day: iso(cand), inDays, turns: b.year === null ? null : y - b.year, kept }
    }
  }
  throw new Error('a lunar anniversary recurs within three lunar years')
}

type BirthdayFacts = {
  /** A lunar birthday's own recurring date, "农历九月初三"; null for a solar one. */
  lunarDate: string | null
  /** The solar day of birth; null without a year. */
  bornSolar: string | null
  /** The day of birth in lunar notation with its year; null without a year. */
  bornLunar: string | null
  /** Needs the year. */
  zodiac: string | null
  /** Null for a lunar birthday without a year: its solar date moves between signs. */
  sign: string | null
  hour: string | null
}

/** A lunar birthday's own recurring date, "农历九月初三"; null for a solar one. */
export function lunarDateOf(b: Birthday): string | null {
  return b.calendar === 'lunar' ? lunarDateLabel(b) : null
}

export function factsOf(b: Birthday, hourBranch: number | null): BirthdayFacts {
  const born = bornDay(b)
  return {
    lunarDate: lunarDateOf(b),
    bornSolar: born ? iso(born) : null,
    bornLunar: born ? born.getLunarDay().toString() : null,
    // The zodiac turns at the lunar new year, not at 立春, so it comes from the lunar year.
    zodiac: born
      ? born
          .getLunarDay()
          .getLunarMonth()
          .getLunarYear()
          .getSixtyCycle()
          .getEarthBranch()
          .getZodiac()
          .toString()
      : null,
    sign: signOf(b, born),
    hour: hourBranch === null ? null : (HOUR_BRANCHES[hourBranch] ?? null),
  }
}

/** The solar day of birth, or null without a year or for a day that never existed. */
function bornDay(b: Birthday): SolarDay | null {
  if (b.year === null || birthdayProblem(b) !== null) return null
  if (b.calendar === 'solar') return SolarDay.fromYmd(b.year, b.month, b.day)
  return LunarDay.fromYmd(b.year, b.leapMonth ? -b.month : b.month, b.day).getSolarDay()
}

/** Why this birthday never happened in its year, or null when it did. */
export function birthdayProblem(b: Birthday): string | null {
  if (b.year === null) return null
  if (b.calendar === 'solar') {
    return b.month === 2 && b.day === 29 && !isLeapYear(b.year)
      ? `February has 28 days in ${b.year}, so there is no 29th.`
      : null
  }
  const name = `${b.leapMonth ? '闰' : ''}${LUNAR_MONTHS[b.month - 1]}`
  if (b.leapMonth && LunarYear.fromYear(b.year).getLeapMonth() !== b.month) {
    return `There was no ${name} in ${b.year}.`
  }
  const length = LunarMonth.fromYm(b.year, b.leapMonth ? -b.month : b.month).getDayCount()
  return b.day > length
    ? `${name} has ${length} days in ${b.year}, so there is no ${LUNAR_DAYS[b.day - 1]}.`
    : null
}

function signOf(b: Birthday, born: SolarDay | null): string | null {
  if (born) return born.getConstellation().toString()
  // A solar month and day always fall in the same sign, so any leap year will do.
  if (b.calendar === 'solar') {
    return SolarDay.fromYmd(2000, b.month, b.day).getConstellation().toString()
  }
  return null
}

/** "农历九月初三": the recurring date, from the tables, so a 30th stays a 30th. */
function lunarDateLabel(b: Birthday): string {
  return `农历${b.leapMonth ? '闰' : ''}${LUNAR_MONTHS[b.month - 1]}${LUNAR_DAYS[b.day - 1]}`
}

/** A calendar square's lunar day, "初三", with the month on its first day, "九月初一". */
export function lunarDayLabel(day: string): string {
  const lunar = parseDay(day).getLunarDay()
  const name = lunar.getName()
  return name === '初一' ? `${lunar.getLunarMonth().getName()}${name}` : name
}

/** "十二月廿九": month and day, no year. */
function lunarFullLabel(day: string): string {
  const lunar = parseDay(day).getLunarDay()
  return `${lunar.getLunarMonth().getName()}${lunar.getName()}`
}

/** The length of `month` in the lunar year `day` falls in; negative months are leap months. */
function lunarMonthLength(day: string, month: number): number {
  const year = parseDay(day).getLunarDay().getLunarMonth().getLunarYear().getYear()
  return LunarMonth.fromYm(year, month).getDayCount()
}

/** The move said in a sentence, with the Chinese date names kept: "No 闰六月 in 2027, …". */
export function keptNote(b: Birthday, next: BirthdayOccurrence): string | null {
  if (next.kept.length === 0) return null
  // The solar year, matching the date shown beside the note.
  const year = next.day.slice(0, 4)
  if (next.kept.includes('short-february')) {
    return `February has 28 days in ${year}, so it is kept on the 28th.`
  }
  const plain = LUNAR_MONTHS[b.month - 1]
  const landing = lunarFullLabel(next.day)
  if (next.kept.includes('leap-month')) {
    const also = next.kept.includes('short-month')
      ? `, and ${plain} has ${lunarMonthLength(next.day, b.month)} days there`
      : ''
    return `No 闰${plain} in ${year}${also}, so it is kept on ${landing}.`
  }
  // Born in a leap month in a year that has it: the leap month is the one measured.
  const month = b.leapMonth ? -b.month : b.month
  const length = lunarMonthLength(next.day, month)
  return `${b.leapMonth ? '闰' : ''}${plain} has ${length} days in ${year}, so it is kept on ${landing}.`
}
