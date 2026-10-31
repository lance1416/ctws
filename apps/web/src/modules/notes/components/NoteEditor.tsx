import type { NoteResponse } from '@ctws/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { problemText } from '../../../platform/http/api'
import { area } from '../../../platform/ui/formStyles'
import { MarkdownField } from '../../../shell/links'
import { createNote, noteKeys, notesQuery, patchNote } from '../api'
import { noteTitle } from '../logic/title'

/** How long the text rests before what is typed is saved. */
const SAVE_AFTER_MS = 800

/**
 * A NOTE, WRITTEN (FR-050, FR-074, REQ-002 artboard 34): its title and its Markdown, saved as they
 * rest, in the one editor, which draws the note as it will read except on the cursor's line. A
 * note not yet made is made by its first words, and `onMade` says where it now lives.
 */
export function NoteEditor({
  note,
  onMade,
}: {
  note: NoteResponse | null
  onMade?: (made: NoteResponse) => void
}) {
  const qc = useQueryClient()
  const [title, setTitle] = useState(note?.title ?? '')
  const [body, setBody] = useState(note?.body ?? '')
  // Untitled, it is called as lists call it (a meeting's and its day, else its first line); the
  // box says so (R-05, FR-050).
  const named =
    body.trim() || note?.anchor
      ? noteTitle({ title: null, body, anchor: note?.anchor ?? null })
      : null
  const made = useRef<NoteResponse | null>(note)
  const save = useMutation({
    mutationFn: async (next: { title: string; body: string }) => {
      const fields = { title: next.title.trim() || null, body: next.body }
      const saved = made.current
        ? await patchNote(made.current.id, fields)
        : await createNote(fields)
      const first = made.current === null
      made.current = saved
      if (first) onMade?.(saved)
      return saved
    },
    meta: { changes: ['note'], ownsError: true },
    onSuccess: (saved) =>
      qc.setQueryData(notesQuery().queryKey, (was: NoteResponse[] = []) => [
        saved,
        ...was.filter((n) => n.id !== saved.id),
      ]),
  })
  useEffect(() => {
    const was = made.current
    if (was ? was.body === body && (was.title ?? '') === title : !body.trim() && !title.trim())
      return
    const t = setTimeout(() => save.mutate({ title, body }), SAVE_AFTER_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a save per pause in the typing.
  }, [title, body])
  // Leaving with the last words still resting: they are saved on the way out, not dropped with
  // the timer that was to save them.
  const latest = useRef({ title, body })
  latest.current = { title, body }
  useEffect(
    () => () => {
      const { title: t, body: b } = latest.current
      const was = made.current
      const fields = { title: t.trim() || null, body: b }
      const pending = was
        ? was.body !== b || (was.title ?? '') !== t
        : b.trim() !== '' || t.trim() !== ''
      const out = pending
        ? (was ? patchNote(was.id, fields) : createNote(fields)).catch(() => undefined)
        : Promise.resolve()
      void out.then(() => qc.invalidateQueries({ queryKey: noteKeys.all }))
    },
    [qc],
  )
  return (
    <div className="flex flex-col gap-3">
      {/* The page's title, written where it reads (artboard 34): no box around it. */}
      <input
        aria-label="Title"
        placeholder={named ?? 'Title'}
        value={title}
        autoFocus={note === null}
        onChange={(e) => setTitle(e.target.value)}
        className={`w-full max-w-[68ch] bg-transparent text-title text-ink outline-none placeholder:text-subtle ${
          named ? 'placeholder:text-ink' : ''
        }`}
      />
      <p className="-mt-2 min-h-4 text-meta text-subtle" aria-live="polite">
        {save.isPending ? 'Saving…' : made.current && !save.isError ? 'Saved' : ''}
      </p>
      <MarkdownField
        value={body}
        onChange={setBody}
        label="Note"
        placeholder="Write, or type @ to mention someone"
        autoFocus={note !== null}
        className="min-h-80 max-w-[68ch]"
        fallback={{ rows: 18, className: `${area} min-h-80 max-w-[68ch]` }}
      />
      {save.isError && (
        <p role="alert" className="text-ui text-stop-t">
          {problemText(save.error)}
        </p>
      )}
    </div>
  )
}
