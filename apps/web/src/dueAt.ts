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

/**
 * A deadline moved to another calendar day, keeping its time of day (local, to the second).
 * Pushing "due 09:00 on the 1st" to the 4th gives 09:00 on the 4th: the person is moving the
 * date, so inventing midnight (which reads as "due at the very start of the day") or "now"
 * would be changing something they did not touch.
 */
export function moveDueToDay(dueIso: string, day: string): string {
  const d = new Date(dueIso)
  const [y, m, dd] = day.split('-').map(Number) as [number, number, number]
  d.setFullYear(y, m - 1, dd)
  return d.toISOString()
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** A local calendar day as "YYYY-MM-DD": the shape `scheduled_on` is stored and sent in. */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// Calendar arithmetic on a "YYYY-MM-DD" string, done in UTC so a DST change cannot shift the day.
function fromYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d))
}
const toYmd = (d: Date) =>
  `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`

export function addDays(day: string, n: number): string {
  const d = fromYmd(day)
  d.setUTCDate(d.getUTCDate() + n)
  return toYmd(d)
}

/** The Monday after `day` (always strictly later, so "下周" from a Monday is a week away). */
export function nextMonday(day: string): string {
  const dow = fromYmd(day).getUTCDay() // 0 = Sunday
  return addDays(day, dow === 0 ? 1 : 8 - dow)
}

/** A calendar day as the reader says it: 今天 / 明天 / 昨天, else "10月8日" (with the year if it differs). */
export function dayPhrase(day: string, today: string): string {
  if (day === today) return '今天'
  if (day === addDays(today, 1)) return '明天'
  if (day === addDays(today, -1)) return '昨天'
  const [y, m, d] = day.split('-').map(Number)
  return today.slice(0, 4) === day.slice(0, 4) ? `${m}月${d}日` : `${y}年${m}月${d}日`
}

export type DateHints = {
  /** "排到明天": present whenever the task has a scheduled day. */
  scheduled: string | null
  /** The deadline as a short phrase; `overdue` is true when its day has passed. */
  due: { text: string; overdue: boolean } | null
}

/**
 * The date cues worth showing on a row. A finished or cancelled task shows none: its dates no
 * longer tell the reader anything. Overdue uses the same rule as the server's segment cascade
 * (the deadline is before the start of today), and the same label as the Today page.
 */
export function dateHints(
  t: { status: string; dueAt: string | null; scheduledOn: string | null },
  now: Date = new Date(),
): DateHints {
  if (t.status === 'done' || t.status === 'cancelled') return { scheduled: null, due: null }
  const today = ymd(now)
  const scheduled = t.scheduledOn ? `排到${dayPhrase(t.scheduledOn, today)}` : null
  if (!t.dueAt) return { scheduled, due: null }
  const due = new Date(t.dueAt)
  const dueDay = ymd(due)
  if (dueDay < today) return { scheduled, due: { text: overdueLabel(t.dueAt, now), overdue: true } }
  const clock = `${pad2(due.getHours())}:${pad2(due.getMinutes())}`
  const text = dueDay === today ? `今天 ${clock} 截止` : `${dayPhrase(dueDay, today)}截止`
  return { scheduled, due: { text, overdue: false } }
}

/**
 * WHETHER A ROW WOULD FILL EACH DATE CELL -- the same two answers `dateHints` gives, with the
 * CLOCK TAKEN OUT.
 *
 * A list decides which date columns it reserves from every one of its rows (rows-and-reading spec
 * §2), and that decision must not be able to disagree with what the rows then render. `dateHints`
 * reads the clock to word the cell ("已逾 5 天" against "明天截止"), but whether the cell exists at
 * all never depends on it: a deadline that has passed still occupies the deadline column. So this
 * is the predicate, and `dueAt.test.ts` pins that the two agree -- including at an instant where
 * the wording changes, which is where a clock-reading predicate would drift.
 */
export function dateCells(t: {
  status: string
  dueAt: string | null
  scheduledOn: string | null
}): { due: boolean; plan: boolean } {
  if (t.status === 'done' || t.status === 'cancelled') return { due: false, plan: false }
  return { due: t.dueAt !== null, plan: t.scheduledOn !== null }
}

/**
 * The mark on a plan that has been carried: planned for a day that has already passed and still
 * not done. Null for a plan on today or later (today's own plans stay quiet) and for no plan.
 * It names the planned day and says it was carried; it is deliberately not worded like the
 * overdue label, since a missed plan is not a missed deadline.
 */
export function carriedLabel(scheduledOn: string | null, now: Date = new Date()): string | null {
  if (!scheduledOn) return null
  const today = ymd(now)
  if (scheduledOn >= today) return null
  return `原定${dayPhrase(scheduledOn, today)}，已顺延`
}
