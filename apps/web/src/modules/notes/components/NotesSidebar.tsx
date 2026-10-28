import { useQuery } from '@tanstack/react-query'
import { NavLink } from 'react-router-dom'
import { notesQuery } from '../api'
import { NOTES_ID } from '../logic/id'
import { noteTitle } from '../logic/title'

const ROW = ({ isActive }: { isActive: boolean }) =>
  `mx-1.5 flex h-7.5 items-center rounded-control px-2 text-ui hover:bg-hover ${
    isActive ? 'bg-select font-medium text-ink' : 'text-ink'
  }`

/** The Notes sidebar's list: every note, the latest edited first (FR-050). */
export function NotesSidebar() {
  const notes = useQuery(notesQuery())
  return (
    <nav aria-label="Notes" className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2">
      <ul className="flex flex-col gap-px">
        {(notes.data ?? []).map((n) => (
          <li key={n.id} data-note-row={n.id}>
            <NavLink to={`/${NOTES_ID}/${n.id}`} className={ROW}>
              <span className="truncate">{noteTitle(n)}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Things' count for notes: every one, zero included. */
export function NotesCount() {
  const notes = useQuery(notesQuery())
  if (!notes.data) return null
  return <span data-count>{notes.data.length}</span>
}
