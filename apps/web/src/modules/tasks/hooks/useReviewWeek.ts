import { addDays } from '@ctws/core/day'
import { useSearchParams } from 'react-router-dom'
import { nextMonday } from '../../../platform/time/dates'
import { useAccountToday } from '../../../shell/auth'

const MONDAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * The week under review, by its Monday, in the address (`?week=`) so the weeks in the sidebar and
 * the page agree and a reload stays on it. No week is this week.
 */
export function useReviewWeek() {
  const [params, setParams] = useSearchParams()
  const thisMonday = addDays(nextMonday(useAccountToday()), -7)
  const asked = params.get('week')
  const week = asked && MONDAY.test(asked) && asked < thisMonday ? asked : null
  const show = (monday: string | null) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      // A week chosen leaves Done for the week.
      next.delete('view')
      if (monday && monday !== thisMonday) next.set('week', monday)
      else next.delete('week')
      return next
    })
  return { week, monday: week ?? thisMonday, thisMonday, show }
}
