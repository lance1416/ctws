/**
 * WHAT DELETING A MEETING ASKS (FR-035): what goes, and what stays. A series counts the meetings
 * it has already held, which go with it; their notes stay, on their own. One that has held none
 * says only that it goes. A one-off says its notes stay only when it has some.
 */
export function deleteQuestion({
  title,
  repeats,
  held,
  hasNotes,
}: {
  title: string
  repeats: boolean
  /** How many of a series' meetings have already been held: cancelled ones not counted. */
  held: number
  hasNotes: boolean
}): string {
  const ask = `Delete ${title}?`
  if (!repeats)
    return hasNotes
      ? `${ask} The meeting goes. Its notes stay, as notes on their own.`
      : `${ask} The meeting goes.`
  if (held === 0) return `${ask} The series goes.`
  const meetings = held === 1 ? '1 meeting' : `${held} meetings`
  return `${ask} The series goes, with the ${meetings} already held. Their notes stay, as notes on their own.`
}
