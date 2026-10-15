import { addDays, dayPhrase, nextMonday } from '../../platform/time/dates'

/** When to finish something, as named days rather than a date picker. */
export type PlanDay = 'today' | 'tomorrow' | 'thisWeek' | 'nextWeek'

export const PLAN_DAYS: readonly { id: PlanDay; day: (today: string) => string }[] = [
  { id: 'today', day: (t) => t },
  { id: 'tomorrow', day: (t) => addDays(t, 1) },
  // The Sunday that ends this week.
  { id: 'thisWeek', day: (t) => addDays(nextMonday(t), -1) },
  { id: 'nextWeek', day: (t) => nextMonday(t) },
]

/**
 * The named days to finish by, one per distinct day (on a Saturday "this week" is tomorrow), with
 * a day already set that is none of them kept first so a picker can still show it.
 */
export function planChoices(
  today: string,
  current: string | null,
  labels: Record<PlanDay, string>,
): { value: string; label: string }[] {
  const named: { value: string; label: string }[] = []
  for (const { id, day } of PLAN_DAYS) {
    const value = day(today)
    if (!named.some((c) => c.value === value)) named.push({ value, label: labels[id] })
  }
  if (current === null || named.some((c) => c.value === current)) return named
  return [{ value: current, label: dayPhrase(current, today) }, ...named]
}
