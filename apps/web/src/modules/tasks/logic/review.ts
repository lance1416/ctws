import type { ReviewResponse } from '@ctws/contracts'
import { addDays } from '@ctws/core/day'

type ReviewTask = ReviewResponse['projects'][number]['finished'][number]

/**
 * The Monday `by` weeks from `monday`, or null for this week, which is the review's own default.
 * Never past this week: next week has not happened.
 */
export function weekStep(monday: string, by: number, thisMonday: string): string | null {
  const next = addDays(monday, by * 7)
  return next >= thisMonday ? null : next
}

/** One line of a cell: a task, or the leaves of one parent told as the parent and how many. */
export type CellLine =
  | { kind: 'task'; task: ReviewTask }
  | { kind: 'parent'; parent: { id: string; title: string }; tasks: ReviewTask[] }

/**
 * A cell's lines (FR-081): the leaves of one parent as one line, where more than one of them moved
 * or the parent itself closed (FR-043); the rest one line each. Parents first, the most first.
 */
export function cellLines(tasks: readonly ReviewTask[], closed: ReadonlySet<string>): CellLine[] {
  const under = new Map<string, { parent: { id: string; title: string }; tasks: ReviewTask[] }>()
  for (const t of tasks)
    if (t.parent) {
      const group = under.get(t.parent.id)
      if (group) group.tasks.push(t)
      else under.set(t.parent.id, { parent: t.parent, tasks: [t] })
    }
  const told = [...under.values()].filter((g) => g.tasks.length > 1 || closed.has(g.parent.id))
  const grouped = new Set(told.flatMap((g) => g.tasks.map((t) => t.id)))
  return [
    ...told
      .sort((a, b) => b.tasks.length - a.tasks.length)
      .map((g) => ({ kind: 'parent' as const, ...g })),
    ...tasks.filter((t) => !grouped.has(t.id)).map((task) => ({ kind: 'task' as const, task })),
  ]
}

/** The weeks under their months, the month the Monday is in, newest first as they come. */
export function weeksByMonth<W extends { from: string }>(weeks: readonly W[]) {
  const months: { month: string; weeks: W[] }[] = []
  for (const w of weeks) {
    const month = w.from.slice(0, 7)
    const last = months.at(-1)
    if (last?.month === month) last.weeks.push(w)
    else months.push({ month, weeks: [w] })
  }
  return months
}

/** A week's bar, as a share of the busiest week's: every bar on one scale. */
export const barShare = (finished: number, most: number): number =>
  most === 0 ? 0 : Math.round((finished / most) * 100)
