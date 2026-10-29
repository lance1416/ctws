import type { NoteResponse } from '@ctws/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { problemText } from '../../../platform/http/api'
import { NoteBody } from '../../../platform/notes/NoteBody'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import { EditIcon } from '../../../platform/ui/icons'
import { area, field } from '../../../platform/ui/formStyles'
import { createNote, notesQuery, patchNote } from '../api'
import { noteTitle } from '../logic/title'

/**
 * A NOTE ON A PHONE (DES-001 "会议页、机构页、阅读页、笔记页"): read, with Edit in its bar; Edit
 * is the whole screen, the Markdown box under Cancel and Save. A new one opens in it.
 */
export function PhoneNote({
  note,
  onMade,
}: {
  note: NoteResponse | null
  onMade: (made: NoteResponse) => void
}) {
  const [editing, setEditing] = useState(note === null)
  if (editing)
    return <PhoneNoteEditor note={note} onMade={onMade} onDone={() => setEditing(false)} />
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-11 items-center gap-2">
        <h2 className="min-w-0 flex-1 text-subject text-ink">{note && noteTitle(note)}</h2>
        <button type="button" onClick={() => setEditing(true)} className={BUTTON.secondary}>
          <EditIcon size={16} aria-hidden="true" />
          Edit
        </button>
      </div>
      <div className="rounded-phone-card border border-line bg-panel p-4 text-prose">
        {note?.body.trim() ? (
          <NoteBody source={note.body} />
        ) : (
          <p className="text-subtle">Nothing written yet.</p>
        )}
      </div>
    </div>
  )
}

function PhoneNoteEditor({
  note,
  onMade,
  onDone,
}: {
  note: NoteResponse | null
  onMade: (made: NoteResponse) => void
  onDone: () => void
}) {
  const qc = useQueryClient()
  const [title, setTitle] = useState(note?.title ?? '')
  const [body, setBody] = useState(note?.body ?? '')
  const save = useMutation({
    mutationFn: () => {
      const fields = { title: title.trim() || null, body }
      return note ? patchNote(note.id, fields) : createNote(fields)
    },
    meta: { changes: ['note'], ownsError: true },
    onSuccess: (saved) => {
      qc.setQueryData(notesQuery().queryKey, (was: NoteResponse[] = []) => [
        saved,
        ...was.filter((n) => n.id !== saved.id),
      ])
      if (!note) onMade(saved)
      onDone()
    },
  })
  return (
    <div
      role="dialog"
      aria-label={note ? `Edit ${noteTitle(note)}` : 'New note'}
      className="fixed inset-x-0 top-[env(safe-area-inset-top)] bottom-0 z-40 flex flex-col bg-float"
    >
      <div className="flex h-13 shrink-0 items-center gap-2 border-b border-line px-2">
        <button
          type="button"
          onClick={onDone}
          disabled={save.isPending}
          className="min-h-11 px-2 text-prose text-muted"
        >
          Cancel
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-ui font-medium text-ink">
          {note ? 'Edit note' : 'New note'}
        </span>
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending || (!note && !body.trim() && !title.trim())}
          className={BUTTON.primary}
        >
          Save
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Title"
          placeholder={note ? noteTitle({ ...note, title: null }) : 'Title'}
          className={field}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-label="Note"
          // The box is the screen: Markdown, as on the desk.
          autoFocus
          className={`${area} min-h-0 flex-1 font-mono`}
        />
        {save.isError && (
          <p role="alert" className="text-ui text-stop-t">
            {problemText(save.error) ?? 'Couldn’t save. What you wrote is still here.'}
          </p>
        )}
      </div>
    </div>
  )
}
