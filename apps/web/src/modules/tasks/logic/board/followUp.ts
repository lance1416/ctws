import { addDays } from '@ctws/core/day'
import { nearDay, shortDay, weekdayOf } from '../../../../platform/time/dates'

/**
 * A follow-up day on a card, as a deadline's chip says its day (DES-001 v1.22): Today, Tomorrow,
 * the weekday within the week, the date beyond it. Passed with no reply, it is `late`, said as
 * Yesterday or its date.
 */
export function followUpWords(on: string, today: string): { text: string; late: boolean } {
  if (on < today) return { text: nearDay(on, today) ?? shortDay(on, today), late: true }
  const near = nearDay(on, today)
  return {
    text: near ?? (on <= addDays(today, 6) ? weekdayOf(on, true) : shortDay(on, today)),
    late: false,
  }
}
