import { idFrom, type NoteFolderId, noteId, type NoteResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { problemText } from '../../../platform/http/api'
import { shortDay, ymd } from '../../../platform/time/dates'
import { DangerAction, DangerZone } from '../../../platform/ui/DangerZone'
import { KIND_ICON } from '../../../platform/ui/icons'
import { KIND_TEXT } from '../../../platform/ui/kinds'
import { useAccountToday, useTimeZone } from '../../../shell/auth'
import { DeletedNotice, useDestroy } from '../../../shell/detail'
import { useSubjectOf } from '../../../shell/layout'
import { useRegistry } from '../../../shell/registry'
import { useForgetWhenGone, useRecordRecent } from '../../../shell/search'
import { deleteNote, noteKeys, notesQuery } from '../api'
import { NoteEditor } from '../components/NoteEditor'
import { NOTES_ID } from '../logic/id'
import { noteTitle } from '../logic/title'

/**
 * `/notes/:id`: one note, written in place (FR-050, FR-074), or what happened to it; `/notes/new`
 * (N N): one on its own, made by its first words, in `?folder=` when a folder made it (FR-115), or
 * in the folder of the note `?from=` when N N was pressed on one. One route for both, so the
 * editor the first words were typed in stays as the address turns into the note's own.
 */
export function Note() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const notes = useQuery(notesQuery())
  // The note this page made from `new`: its editor is the one already on screen.
  const [born, setBorn] = useState<string | null>(null)
  const fresh = id === 'new'
  const note = fresh ? undefined : notes.data?.find((n) => n.id === idFrom(noteId, id))
  const [search] = useSearchParams()
  const from = fresh ? notes.data?.find((n) => n.id === search.get('from')) : undefined
  const folderId = (search.get('folder') ?? from?.folderId ?? null) as NoteFolderId | null
  // Said as the folder it is made in, so the sidebar can show it there.
  useEffect(() => {
    if (from?.folderId && !search.get('folder'))
      navigate(`/${NOTES_ID}/new?folder=${from.folderId}`, { replace: true })
  }, [from, search, navigate])
  const gone = !fresh && notes.isSuccess && !note
  useForgetWhenGone('note', fresh ? null : id, gone)
  useSubjectOf(note ? { type: 'note', id: note.id, title: noteTitle(note) } : null)
  useRecordRecent(
    note
      ? {
          type: 'note',
          id: note.id,
          title: noteTitle(note),
          to: `/${NOTES_ID}/${note.id}`,
          kind: 'Note',
        }
      : null,
  )
  if (gone) return <DeletedNotice type="note" id={id} />
  if (!fresh && !note) return null
  return (
    // On a phone the note is written on the panel's white (artboard 35: the page under it takes
    // it, `data-paper`), and its foot leaves room for the row over the keyboard, which sits on the
    // tab bar when there is no keyboard.
    <div data-paper className="flex min-h-full shrink-0 flex-col max-lg:pb-14">
      <h1 className="sr-only">{note ? noteTitle(note) : 'New note'}</h1>
      {/* The one editor, on a phone too (REQ-002 FR-106, artboard 35). */}
      <NoteEditor
        key={note && note.id !== born ? note.id : 'new'}
        note={note ?? null}
        folderId={folderId}
        onMade={(made) => {
          setBorn(made.id)
          navigate(`/${NOTES_ID}/${made.id}`, { replace: true })
        }}
        above={
          note ? (
            <HungOn note={note} />
          ) : (
            <p className="text-meta text-muted max-lg:hidden">On its own</p>
          )
        }
        below={
          note && (
            <DangerZone>
              <DeleteNote note={note} onDeleted={() => navigate(`/${NOTES_ID}`)} />
            </DangerZone>
          )
        }
      />
    </div>
  )
}

/** What the note hangs on, and its day when that is a meeting's (FR-050). */
function HungOn({ note }: { note: Pick<NoteResponse, 'anchor' | 'heldAt'> }) {
  const registry = useRegistry()
  const today = useAccountToday()
  const zone = useTimeZone()
  const a = note.anchor
  if (!a) return <p className="text-meta text-muted max-lg:hidden">On its own</p>
  const Icon = KIND_ICON[a.type]
  const to =
    a.type === 'meeting' && a.occurrenceId
      ? `${registry.relationFor('meeting').to(a.id)}?${new URLSearchParams({ at: a.occurrenceId })}`
      : registry.relationFor(a.type).to(a.id)
  return (
    // Running text, so the comma sits against the name.
    <p className="text-meta text-muted">
      On{' '}
      <Link
        to={to}
        className="inline-flex items-center gap-1 align-bottom text-ink hover:underline max-lg:tap"
      >
        <Icon size={12} aria-hidden="true" className={KIND_TEXT[a.type]} />
        {a.title ?? 'something gone'}
      </Link>
      {note.heldAt && `, ${shortDay(ymd(new Date(note.heldAt), zone), today)}`}
    </p>
  )
}

function DeleteNote({ note, onDeleted }: { note: NoteResponse; onDeleted: () => void }) {
  const drop = useDestroy({
    type: 'note',
    id: note.id,
    remove: () => deleteNote(note.id),
    awaits: [noteKeys.all],
    onDone: onDeleted,
  })
  return (
    <>
      <DangerAction
        label={`Delete ${noteTitle(note)}`}
        confirmLabel="Confirm deleting this note"
        message={`Delete ${noteTitle(note)}? The note goes. What it hangs on stays.`}
        confirm={`Delete ${noteTitle(note)}`}
        busy={drop.isPending}
        onConfirm={() => drop.mutate()}
      />
      {drop.isError && (
        <p role="alert" className="text-ui text-stop-t">
          {problemText(drop.error)}
        </p>
      )}
    </>
  )
}
