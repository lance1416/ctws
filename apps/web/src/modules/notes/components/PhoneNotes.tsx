import type { NoteResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ICON_BUTTON } from '../../../platform/ui/buttonStyles'
import { CollapseIcon, KIND_ICON, NewIcon, PinIcon } from '../../../platform/ui/icons'
import { KIND_TEXT } from '../../../platform/ui/kinds'
import { FilteredEmpty, MORE_PATH, PhoneHead, SidebarFilter } from '../../../shell/layout'
import { foldersQuery, notesQuery } from '../api'
import { NOTES_ID } from '../logic/id'
import { everyShelf, shelvesOf, type Shelf } from '../logic/shelves'
import { noteTitle } from '../logic/title'

const ROW = 'flex min-h-12 items-center gap-3 px-4 text-prose text-ink active:bg-hover'
const CARD = 'overflow-hidden rounded-phone border border-line bg-panel'

/**
 * NOTES ON A PHONE (REQ-002 FR-110, artboard 35): the filter, then the pinned, the folders, the
 * notes in none and those on other things, each place a card. A folder, at any of its three
 * levels (FR-117), opens on the same page (`?folder=`) to its pinned notes, the folders in it and
 * then its other notes, "‹" back to the folder it is in, or to Notes.
 */
export function PhoneNotes() {
  const notes = useQuery(notesQuery())
  const folders = useQuery(foldersQuery())
  const [params] = useSearchParams()
  const [typed, setTyped] = useState('')
  const s = shelvesOf(notes.data ?? [], folders.data ?? [], typed)
  const shelves = everyShelf(s.folders)
  const open = shelves.find((f) => f.folder.id === params.get('folder'))
  const over = open && shelves.find((f) => f.folder.id === open.folder.parentId)
  const newNote = (
    <Link to={`/${NOTES_ID}/new`} aria-label="New note" className={ICON_BUTTON}>
      <NewIcon size={20} aria-hidden="true" />
    </Link>
  )

  if (open)
    return (
      <div className="flex flex-col gap-3">
        <PhoneHead
          title={open.folder.name}
          back={
            over
              ? { to: `/${NOTES_ID}?folder=${over.folder.id}`, label: over.folder.name }
              : { to: `/${NOTES_ID}`, label: 'Notes' }
          }
          actions={newNote}
        />
        <Place title={null}>
          {open.pinned.map((n) => (
            <NoteRow key={n.id} note={n} />
          ))}
          {open.folders.map((f) => (
            <FolderRow key={f.folder.id} shelf={f} />
          ))}
          {open.notes.map((n) => (
            <NoteRow key={n.id} note={n} />
          ))}
        </Place>
      </div>
    )

  const nothing =
    s.pinned.length + s.loose.length + s.onThings.length === 0 &&
    s.folders.every((f) => f.count === 0)
  return (
    <div className="flex flex-col gap-3">
      <PhoneHead title="Notes" back={{ to: MORE_PATH, label: 'More' }} actions={newNote} />
      <SidebarFilter what="notes" value={typed} onChange={setTyped} />
      {s.pinned.length > 0 && (
        <Place title="Pinned" icon={<PinIcon size={12} aria-hidden="true" />}>
          {s.pinned.map((n) => (
            <NoteRow key={n.id} note={n} />
          ))}
        </Place>
      )}
      {s.folders.length > 0 && (
        <Place title="Folders">
          {s.folders.map((f) => (
            <FolderRow key={f.folder.id} shelf={f} />
          ))}
        </Place>
      )}
      {s.loose.length > 0 && (
        <Place title={s.folders.length > 0 ? 'Not in a folder' : 'On their own'}>
          {s.loose.map((n) => (
            <NoteRow key={n.id} note={n} />
          ))}
        </Place>
      )}
      {s.onThings.length > 0 && (
        <Place title="On other things">
          {s.onThings.map((n) => (
            <NoteRow key={n.id} note={n} />
          ))}
        </Place>
      )}
      {typed.trim() !== '' && nothing && (
        <FilteredEmpty typed={typed} onClear={() => setTyped('')} />
      )}
    </div>
  )
}

/** One of the places: its small heading, then its rows on a card. */
function Place({
  title,
  icon,
  children,
}: {
  title: string | null
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-label={title ?? undefined} className="flex flex-col gap-1.5">
      {title && (
        <h2 className="flex items-center gap-1.5 px-1 text-meta text-muted">
          {icon}
          {title}
        </h2>
      )}
      <ul className={`${CARD} divide-y divide-line`}>{children}</ul>
    </section>
  )
}

/** A folder, by name, with every note in it and in the folders under it. */
function FolderRow({ shelf: { folder, count } }: { shelf: Shelf }) {
  return (
    <li>
      <Link to={`/${NOTES_ID}?folder=${folder.id}`} className={ROW}>
        <span className="flex-1 truncate">{folder.name}</span>
        <span data-count className="text-meta text-muted tabular-nums">
          {count}
        </span>
        <CollapseIcon size={16} aria-hidden="true" className="text-muted" />
      </Link>
    </li>
  )
}

/** A note, by name, with its kind's mark: a note's own, or what it hangs on. */
function NoteRow({ note }: { note: NoteResponse }) {
  const type = note.anchor?.type ?? 'note'
  const Icon = KIND_ICON[type]
  return (
    <li data-note-row={note.id}>
      <Link to={`/${NOTES_ID}/${note.id}`} className={ROW}>
        <Icon size={20} aria-hidden="true" className={`shrink-0 ${KIND_TEXT[type]}`} />
        <span className="flex-1 truncate">{noteTitle(note)}</span>
        <CollapseIcon size={16} aria-hidden="true" className="text-muted" />
      </Link>
    </li>
  )
}
