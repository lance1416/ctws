import type { NoteFolderId, NoteResponse } from '@ctws/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import type { EditorHandle } from '../../../platform/editor/MarkdownEditor'
import { problemText } from '../../../platform/http/api'
import { area } from '../../../platform/ui/formStyles'
import { usePhone } from '../../../platform/ui/phone'
import { MarkdownField } from '../../../shell/links'
import { createNote, noteKeys, notesQuery, patchNote } from '../api'
import { FindBar } from '../../../platform/editor/FindBar'
import {
  OutlineButton,
  OutlineNav,
  useOutline,
  useSectionInSight,
} from '../../../platform/editor/OutlineNav'
import { OUTLINE_KEYS, useNoteKeys } from '../../../platform/editor/noteKeys'
import { outlineOf } from '../../../platform/editor/outline'
import { readableWidth } from '../../../platform/editor/measure'
import { SourceButton } from '../../../platform/editor/SourceButton'
import { useNoteChoice } from '../../../shell/auth'
import { noteTitle } from '../logic/title'
import { FolderTag, NoteMenu, PinButton } from './NoteMenu'
import { PhoneNoteBar } from './PhoneNoteBar'

/** How long the text rests before what is typed is saved. */
const SAVE_AFTER_MS = 800

/**
 * A NOTE, WRITTEN (FR-050, FR-074, REQ-002 artboards 34 and 37): its title and its Markdown, saved
 * as they rest, in the one editor, which draws the note as it will read except on the cursor's
 * line, or shows its source. The whole main area is the note's, as a code editor's is, its outline
 * a panel on the right that can be put away. A note not yet made is made by its first words, and
 * `onMade` says where it now lives. `above` and `below` are the page's, on either side of it.
 */
export function NoteEditor({
  note,
  onMade,
  folderId = null,
  above,
  below,
}: {
  note: NoteResponse | null
  onMade?: (made: NoteResponse) => void
  /** The folder a note not yet made is made in (FR-115). */
  folderId?: NoteFolderId | null
  above?: ReactNode
  below?: ReactNode
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
        : await createNote({ ...fields, ...(folderId ? { folderId } : {}) })
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
  // Renamed in the sidebar while it is open (FR-114): the title takes the new name, unless what
  // is in the box is still being written.
  useEffect(() => {
    const was = made.current
    if (!note || !was || note.id !== was.id || note.title === was.title) return
    if (title !== (was.title ?? '')) return
    made.current = { ...was, title: note.title }
    setTitle(note.title ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a rename from elsewhere only.
  }, [note?.title])
  // Leaving with the last words still resting: they are saved on the way out, not dropped with
  // the timer that was to save them.
  const latest = useRef({ title, body, folderId })
  latest.current = { title, body, folderId }
  useEffect(
    () => () => {
      const { title: t, body: b, folderId: f } = latest.current
      const was = made.current
      const fields = { title: t.trim() || null, body: b }
      const pending = was
        ? was.body !== b || (was.title ?? '') !== t
        : b.trim() !== '' || t.trim() !== ''
      const out = pending
        ? (was
            ? patchNote(was.id, fields)
            : createNote({ ...fields, ...(f ? { folderId: f } : {}) })
          ).catch(() => undefined)
        : Promise.resolve()
      void out.then(() => qc.invalidateQueries({ queryKey: noteKeys.all }))
    },
    [qc],
  )
  const phone = usePhone()
  const headings = useMemo(() => outlineOf(body), [body])
  const editor = useRef<EditorHandle | null>(null)
  const current = useSectionInSight(editor, headings)
  const [shown, setShown] = useNoteChoice('outlineShown')
  const [readable] = useNoteChoice('readableLines')
  const [source, setSource] = useNoteChoice('sourceView')
  const outline = useOutline(shown, setShown)
  const flipSource = () => setSource(!source)
  useNoteKeys({ outline: headings.length > 0 ? outline.toggle : undefined, source: flipSource })
  // Ctrl F's bar while it is open, counting the presses that opened it.
  const [finding, setFinding] = useState<number | null>(null)
  return (
    // On a desk the page takes the main area's edges back: the outline runs down its right side.
    <div ref={outline.frame} className="relative flex flex-1 lg:-m-5">
      <div className="flex min-w-0 flex-1 flex-col gap-4 lg:px-10 lg:py-5">
        <div className={`flex w-full flex-col gap-3 ${readable ? readableWidth(source) : ''}`}>
          {above}
          <PhoneNoteBar
            note={note}
            headings={headings}
            editor={editor}
            title={title.trim() || named || ''}
            body={body}
            source={source}
            onSource={flipSource}
          />
          {/* The title's size on the row too: on a phone a field is sized against its parent
              (styles.css, 16 at least), and this keeps it the title's 26. */}
          <div className="flex items-start gap-2 text-title">
            <input
              aria-label="Title"
              // Written where it reads, as the text is: the cursor shows where, no ring round it.
              data-bare
              placeholder={named ?? 'Title'}
              value={title}
              autoFocus={note === null}
              onChange={(e) => setTitle(e.target.value)}
              className={`min-w-0 flex-1 bg-transparent max-lg:min-h-11 text-title text-ink outline-none placeholder:text-muted ${
                named ? 'placeholder:text-ink' : ''
              }`}
            />
            {/* On a phone the bar above has them (artboard 35). */}
            <span className="flex items-start gap-2 max-lg:hidden">
              {note && note.anchor === null && <PinButton note={note} />}
              {made.current && (
                <NoteMenu
                  note={note}
                  title={title.trim() || named || ''}
                  body={body}
                  source={source}
                  onSource={flipSource}
                />
              )}
              <SourceButton source={source} onSource={flipSource} />
              {headings.length > 0 && <OutlineButton outline={outline} keys={OUTLINE_KEYS} />}
            </span>
          </div>
          <div className="-mt-1 flex min-h-5.5 items-center gap-2">
            <FolderTag folderId={note?.folderId ?? folderId} noteId={note?.id ?? null} />
            <p className="text-meta text-muted" aria-live="polite">
              {save.isPending ? 'Saving…' : made.current && !save.isError ? 'Saved' : ''}
            </p>
          </div>
          {finding !== null && (
            <FindBar editor={editor.current} nonce={finding} onClose={() => setFinding(null)} />
          )}
          <MarkdownField
            value={body}
            onChange={setBody}
            label="Note"
            placeholder="Write, or type @ to mention someone"
            // A note opened to read on a phone waits for a tap: no keyboard, no row over it.
            autoFocus={note !== null && !phone}
            className="min-h-80"
            handle={editor}
            onFind={() => setFinding((n) => (n ?? 0) + 1)}
            source={source}
            fallback={{ rows: 18, className: `${area} min-h-80` }}
          />
          {save.isError && (
            <p role="alert" className="text-ui text-stop-t">
              {problemText(save.error)}
            </p>
          )}
          {below}
        </div>
      </div>
      <OutlineNav
        outline={outline}
        headings={headings}
        current={current}
        onJump={(h) => editor.current?.goTo(h.offset)}
      />
    </div>
  )
}
