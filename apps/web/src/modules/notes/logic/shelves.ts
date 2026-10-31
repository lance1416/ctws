import type { NoteFolderResponse, NoteResponse } from '@ctws/contracts'
import { noteTitle } from './title'

/** One folder and the notes in it, the latest edited first. */
export type Shelf = { folder: NoteFolderResponse; notes: NoteResponse[] }

/**
 * THE NOTES SIDEBAR'S PLACES (REQ-002 FR-110, artboard 34): the pinned, newest pin first; each
 * folder by name with its notes; the notes on their own in none; and those hung on other things.
 * A pinned note is listed under Pinned only. `filter` keeps the notes whose name has its words;
 * a folder with none of them left goes too.
 */
export function shelvesOf(
  notes: readonly NoteResponse[],
  folders: readonly NoteFolderResponse[],
  filter = '',
): {
  pinned: NoteResponse[]
  folders: Shelf[]
  loose: NoteResponse[]
  onThings: NoteResponse[]
} {
  const words = filter.trim().toLowerCase()
  const kept = words ? notes.filter((n) => noteTitle(n).toLowerCase().includes(words)) : notes
  const pinned = kept
    .filter((n) => n.pinnedAt !== null)
    .sort((a, b) => b.pinnedAt!.localeCompare(a.pinnedAt!))
  const unpinned = kept.filter((n) => n.pinnedAt === null)
  const shelves = folders
    .map((folder) => ({ folder, notes: unpinned.filter((n) => n.folderId === folder.id) }))
    .filter((s) => !words || s.notes.length > 0)
  const known = new Set(folders.map((f) => f.id))
  return {
    pinned,
    folders: shelves,
    // A folder another tab has just deleted leaves its notes here until the list catches up.
    loose: unpinned.filter((n) => n.anchor === null && (!n.folderId || !known.has(n.folderId))),
    onThings: unpinned.filter((n) => n.anchor !== null),
  }
}
