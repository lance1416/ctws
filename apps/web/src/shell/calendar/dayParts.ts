import type { ShownEntry } from '../contract'

/** An entry as the calendar places it: with the module that gave it, for what opens it. */
export type Placed = ShownEntry & { moduleId: string }

/**
 * What the calendar shows of a day (FR-080): meetings, deadlines, follow-ups and birthdays, each a
 * line; the tasks planned for it only counted. Anything else a module dates is not the month's.
 */
export type DayParts = {
  meetings: Placed[]
  due: Placed[]
  followUps: Placed[]
  birthdays: Placed[]
  planned: Placed[]
}

const byTitle = (a: Placed, b: Placed) => a.title.localeCompare(b.title)

export function dayParts(entries: readonly Placed[]): DayParts {
  const of = (kind: string) => entries.filter((e) => e.kind === kind).sort(byTitle)
  return {
    // By the clock; an occurrence always has a time.
    meetings: of('occurrence').sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')),
    due: of('due'),
    followUps: of('follow-up'),
    birthdays: of('birthday'),
    planned: of('planned'),
  }
}

/**
 * A square's lines, in the order they are read: birthdays, which last the day; meetings by time;
 * deadlines; follow-ups. The planned count comes last, after them.
 */
export const squareLines = (parts: DayParts): Placed[] => [
  ...parts.birthdays,
  ...parts.meetings,
  ...parts.due,
  ...parts.followUps,
]
