import type { TaskStatus } from '@ctws/contracts'
import { addDays } from '@ctws/core/day'
import { nearDay, shortDay, weekdayOf, ymd } from '../../../../platform/time/dates'
import { isFinished } from '../status'

/** The tree's Due column (FR-054): what it says, and how loudly. */
export type TreeDue = { text: string; tone: 'soon' | 'late' | 'quiet' | 'waiting' }

/**
 * "Waiting" for an open leaf something unfinished still holds up; else its deadline: within seven
 * days an amber flag ("Today", "Tomorrow", "Fri"), missed a red one, further off or on a settled
 * task grey words. `today` is given; nothing here reads the clock.
 */
export function treeDue(
  task: { dueAt: string | null; status: TaskStatus; waiting: boolean },
  today: string,
  timeZone: string,
): TreeDue | null {
  const settled = isFinished(task.status)
  if (task.waiting && !settled) return { text: 'Waiting', tone: 'waiting' }
  if (!task.dueAt) return null
  const day = ymd(new Date(task.dueAt), timeZone)
  if (settled || day > addDays(today, 7)) return { text: shortDay(day, today), tone: 'quiet' }
  if (day < today) return { text: shortDay(day, today), tone: 'late' }
  const near = nearDay(day, today)
  return {
    text: near ?? (day <= addDays(today, 6) ? weekdayOf(day, true) : shortDay(day, today)),
    tone: 'soon',
  }
}
