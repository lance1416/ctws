import type { OrganisationInTouch } from '@ctws/contracts'
import { addDays } from '@ctws/core/day'
import { nearDay, shortDay, weekdayDay, weekdayOf } from '../../../platform/time/dates'

/**
 * How near a follow-up day is (FR-071): passed is late, red; today or tomorrow is soon, amber;
 * anything after is later, grey.
 */
export function followUpTone(on: string, today: string): 'late' | 'soon' | 'later' {
  if (on < today) return 'late'
  return on <= addDays(today, 1) ? 'soon' : 'later'
}

/** The day on the awaiting table's chip (artboard 15): "Oct 21", "Tomorrow", "Mon, Oct 26". */
export function followUpChip(on: string, today: string): string {
  if (on < today) return shortDay(on, today)
  return nearDay(on, today) ?? weekdayDay(on, today)
}

/** The day as the sidebar says it under a subject: "Follow up was Oct 21", "Follow up tomorrow". */
export function followUpLine(on: string, today: string): string {
  if (on < today) return `Follow up was ${shortDay(on, today)}`
  const near = nearDay(on, today)
  return near ? `Follow up ${near.toLocaleLowerCase()}` : `Follow up ${shortDay(on, today)}`
}

/** When it fell due, as Today's Follow up says it (FR-079): "Due yesterday", "Due Oct 20". */
export function dueLine(on: string, today: string): string {
  const near = nearDay(on, today)
  return near ? `Due ${near.toLocaleLowerCase()}` : `Due ${shortDay(on, today)}`
}

/** The Monday after today: the day "Follow up Mon" moves a follow-up to (FR-079). */
export function nextMonday(today: string): string {
  let day = addDays(today, 1)
  while (weekdayOf(day, true) !== 'Mon') day = addDays(day, 1)
  return day
}

/** What is next with an organisation, as the "Next" column says it, and in which tone (FR-071). */
export function nextWords(
  next: OrganisationInTouch['next'],
  today: string,
): { text: string; tone: 'late' | 'soon' | 'later' } {
  switch (next.kind) {
    case 'follow-up':
      return next.late
        ? { text: 'Follow up late', tone: 'late' }
        : { text: `Follow up ${shortDay(next.on, today)}`, tone: 'later' }
    case 'no-reply':
      return { text: `No reply, ${next.days} days`, tone: 'soon' }
    case 'nothing':
      return { text: 'Nothing', tone: 'later' }
  }
}
