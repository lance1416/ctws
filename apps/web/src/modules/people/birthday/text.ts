import type { BirthdayResponse } from '@ctws/contracts'
import { LUNAR_DAYS, LUNAR_MONTHS } from '@ctws/core/lunar-names'
import { fullDay, MONTHS } from '../../../platform/time/dates'
import type { BirthdayDraft } from '../api'

/** A solar day in the app's own words: `Oct 17, 1991`, or `Oct 17` with no year. */
export function solarDay(year: number | null, month: number, day: number): string {
  return year === null ? `${MONTHS[month - 1]} ${day}` : `${MONTHS[month - 1]} ${day}, ${year}`
}

/**
 * A draft as one line, for the form's button: unlike `givenDate`, only what was typed so far,
 * nothing the server has worked out.
 */
export function plainDate(d: BirthdayDraft): string {
  if (d.calendar === 'solar') return solarDay(d.year, d.month, d.day)
  const month = `${d.leapMonth ? '闰' : ''}${LUNAR_MONTHS[d.month - 1]}`
  return [d.year === null ? null : `${d.year}`, month, LUNAR_DAYS[d.day - 1]]
    .filter(Boolean)
    .join(' ')
}

/** The day as it was written down, in its own calendar, with the year when one was given. */
export function givenDate(b: BirthdayResponse): string {
  if (b.calendar === 'lunar') return b.bornLunar ?? b.lunarDate ?? ''
  return b.bornSolar ? fullDay(b.bornSolar) : solarDay(null, b.month, b.day)
}
