import { type TodayTaskResponse, type TaskId } from '@ctws/contracts'
import type { TriageSection } from '../components/TriageControl'
import { addDays } from '@ctws/core/day'
import { nextMonday } from '../../../platform/time/dates'
import { moveDueToDay } from './dueDates'

type Triageable = Pick<TodayTaskResponse, 'id' | 'segment' | 'dueAt'>

export type TriagePatch = { dueAt?: string | null; scheduledOn?: string | null }

/**
 * The ways out of an overdue or carried row, null when there is nothing to triage. A decision that
 * changes both dates sends them in one request, so the row is never left half-way off every list.
 */
export function triageSections(
  t: Triageable,
  /** A plan for a day already gone. */
  carried: boolean,
  today: string,
  timeZone: string,
  patch: (id: TaskId, body: TriagePatch) => void,
): TriageSection[] | null {
  const tomorrow = addDays(today, 1)
  const nextWeek = nextMonday(today)

  if (t.segment === 'overdue' && t.dueAt) {
    const due = t.dueAt
    return [
      {
        // The deadline stays a deadline and keeps its time of day: a 09:00 standup pushed to
        // tomorrow is still at 09:00.
        heading: 'Push the deadline',
        actions: [
          {
            label: 'To tomorrow',
            run: () => patch(t.id, { dueAt: moveDueToDay(due, tomorrow, timeZone) }),
          },
          {
            label: 'To next week',
            run: () => patch(t.id, { dueAt: moveDueToDay(due, nextWeek, timeZone) }),
          },
          { label: 'Clear the deadline', run: () => patch(t.id, { dueAt: null }) },
        ],
      },
      {
        // The deadline stops being one: nobody is waiting, so it becomes a plan.
        heading: 'Make it a plan',
        actions: [
          { label: 'Today', run: () => patch(t.id, { dueAt: null, scheduledOn: today }) },
          { label: 'Tomorrow', run: () => patch(t.id, { dueAt: null, scheduledOn: tomorrow }) },
          { label: 'Next week', run: () => patch(t.id, { dueAt: null, scheduledOn: nextWeek }) },
        ],
      },
    ]
  }

  if (carried) {
    return [
      {
        // Moves the plan and never touches the deadline.
        heading: null,
        actions: [
          { label: 'Move to today', run: () => patch(t.id, { scheduledOn: today }) },
          { label: 'Move to tomorrow', run: () => patch(t.id, { scheduledOn: tomorrow }) },
          { label: 'Move to next week', run: () => patch(t.id, { scheduledOn: nextWeek }) },
          { label: 'Clear the plan', run: () => patch(t.id, { scheduledOn: null }) },
        ],
      },
    ]
  }

  return null
}
