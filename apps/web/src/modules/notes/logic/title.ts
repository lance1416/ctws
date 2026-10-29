import type { NoteResponse } from '@ctws/contracts'
import { monthDay } from '../../../platform/time/dates'

/**
 * What a note is called in a list: its title; on one meeting, the meeting and that day ("Atlas
 * weekly, Oct 19", FR-050), so a series' notes are told apart; else its first line without its
 * Markdown, else what it hangs on; an empty one says so. A title of its own always wins.
 */
export function noteTitle(note: Pick<NoteResponse, 'title' | 'body' | 'anchor'>): string {
  if (note.title) return note.title
  const a = note.anchor
  if (a?.type === 'meeting' && a.title && a.occurrenceId)
    return `${a.title}, ${monthDay(a.occurrenceId.slice(0, 10))}`
  const first = note.body
    .split('\n')
    .map((l) => l.replace(/^#+\s*|^[-*>]\s*|[*_`]/g, '').trim())
    .find((l) => l !== '')
  if (first) return first.length > 80 ? `${first.slice(0, 79)}…` : first
  return a?.title ? `Notes on ${a.title}` : 'Empty note'
}
