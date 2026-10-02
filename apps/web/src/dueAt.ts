/**
 * "已逾 N 天" for an overdue instant, counted in the user's local calendar days: a task due late
 * yesterday is 1 day overdue, not 0, whatever the hour. Never less than 1, since a task is only
 * overdue once its due day has passed.
 */
export function overdueLabel(dueIso: string, now: Date = new Date()): string {
  const due = new Date(dueIso)
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  // Round, not floor: a DST change makes a local day 23 or 25 hours.
  const days = Math.max(1, Math.round((today.getTime() - dueDay.getTime()) / 86_400_000))
  return `已逾 ${days} 天`
}
