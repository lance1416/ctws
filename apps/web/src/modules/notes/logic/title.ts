import type { NoteResponse } from '@ctws/contracts'

/**
 * What a note is called in a list: its title, else its first line without its Markdown, else what
 * it hangs on; an empty one says so.
 */
export function noteTitle(note: Pick<NoteResponse, 'title' | 'body' | 'anchor'>): string {
  if (note.title) return note.title
  const first = note.body
    .split('\n')
    .map((l) => l.replace(/^#+\s*|^[-*>]\s*|[*_`]/g, '').trim())
    .find((l) => l !== '')
  if (first) return first.length > 80 ? `${first.slice(0, 79)}…` : first
  return note.anchor?.title ? `Notes on ${note.anchor.title}` : 'Empty note'
}
