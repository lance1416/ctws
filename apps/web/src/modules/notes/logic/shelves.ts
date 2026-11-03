import type { NoteFolderResponse, NoteResponse } from '@ctws/contracts'
import { noteTitle } from './title'

/**
 * One folder: its pinned notes, newest pin first, then the folders in it, by name, then its other
 * notes, the latest edited first; `count` is every note in it and in the folders under it, the
 * pinned too (FR-117).
 */
export type Shelf = {
  folder: NoteFolderResponse
  pinned: NoteResponse[]
  folders: Shelf[]
  notes: NoteResponse[]
  count: number
}

/**
 * THE NOTES SIDEBAR'S PLACES (REQ-002 FR-110, FR-117, artboards 34 and 40): the pinned, newest pin
 * first; the folders as a tree, each with its pinned notes, the folders in it by name and then its
 * other notes; the notes on their own in none; and those hung on other things. A pinned note in a
 * folder is listed twice, under Pinned and first in its folder; one in none, under Pinned only.
 * `filter` keeps the notes whose name has its words; a folder with none of them left under it
 * goes too.
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
  const known = new Set(folders.map((f) => f.id))
  const shelfOf = (folder: NoteFolderResponse): Shelf => {
    const under = folders
      .filter((f) => f.parentId === folder.id)
      .map(shelfOf)
      .filter((s) => !words || s.count > 0)
    const own = unpinned.filter((n) => n.folderId === folder.id)
    const pins = pinned.filter((n) => n.folderId === folder.id)
    return {
      folder,
      pinned: pins,
      folders: under,
      notes: own,
      count: pins.length + own.length + under.reduce((n, s) => n + s.count, 0),
    }
  }
  // At the top: those with no parent, and any whose parent another tab has just deleted.
  const top = folders.filter((f) => !f.parentId || !known.has(f.parentId))
  return {
    pinned,
    folders: top.map(shelfOf).filter((s) => !words || s.count > 0),
    // A folder another tab has just deleted leaves its notes here until the list catches up.
    loose: unpinned.filter((n) => n.anchor === null && (!n.folderId || !known.has(n.folderId))),
    onThings: unpinned.filter((n) => n.anchor !== null),
  }
}

/** Every shelf of a tree, each before the ones in it: the notes in the order they are listed. */
export function everyShelf(shelves: readonly Shelf[]): Shelf[] {
  return shelves.flatMap((s) => [s, ...everyShelf(s.folders)])
}

/** The folders in the tree's order, each with how deep it sits (1 at the top): for a picker. */
export function foldersInTree(
  folders: readonly NoteFolderResponse[],
): { folder: NoteFolderResponse; depth: number }[] {
  const known = new Set(folders.map((f) => f.id))
  const under = (parent: NoteFolderResponse['id'] | null, depth: number) =>
    folders
      .filter((f) =>
        parent === null ? !f.parentId || !known.has(f.parentId) : f.parentId === parent,
      )
      .flatMap((folder): { folder: NoteFolderResponse; depth: number }[] => [
        { folder, depth },
        ...under(folder.id, depth + 1),
      ])
  return under(null, 1)
}
