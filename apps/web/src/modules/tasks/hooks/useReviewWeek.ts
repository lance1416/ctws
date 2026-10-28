import { addDays } from '@ctws/core/day'
import { useSearchParams } from 'react-router-dom'
import { nextMonday } from '../../../platform/time/dates'
import { useAccountToday } from '../../../shell/auth'

const MONDAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * The week under review, by its Monday, in the address (`?week=`) so the weeks in the sidebar and
 * the page agree and a reload stays on it. Without one it is last week, the one a review is of
 * (F7); this week, so far, is there to choose.
 */
export function useReviewWeek() {
  const [params, setParams] = useSearchParams()
  const thisMonday = addDays(nextMonday(useAccountToday()), -7)
  const lastMonday = addDays(thisMonday, -7)
  const asked = params.get('week')
  const monday = asked && MONDAY.test(asked) && asked <= thisMonday ? asked : lastMonday
  const show = (week: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      // A week chosen leaves Done for the week.
      next.delete('view')
      if (week === lastMonday) next.delete('week')
      else next.set('week', week)
      return next
    })
  return { monday, thisMonday, show }
}
