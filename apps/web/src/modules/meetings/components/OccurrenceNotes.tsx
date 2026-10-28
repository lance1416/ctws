import type { MeetingOccurrence, NoteResponse } from '@ctws/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { problemText } from '../../../platform/http/api'
import { NoteBody } from '../../../platform/notes/NoteBody'
import { shortDay, weekdayOf } from '../../../platform/time/dates'
import { Block } from '../../../platform/ui/Block'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import { area } from '../../../platform/ui/formStyles'
import { CollapseIcon, ExpandIcon, KIND_ICON, OpenFullIcon } from '../../../platform/ui/icons'
import { useAccountToday } from '../../../shell/auth'
import { meetingKeys, rewriteNote, seriesNotesQuery, writeOccurrenceNote } from '../api'
import { headingsOf } from '../logic/headings'

/** How long the text rests before what is typed is saved. */
const SAVE_AFTER_MS = 800

/** "1,850 words". */
const words = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'word' : 'words'}`

/**
 * THIS OCCURRENCE'S NOTES (FR-067, FR-069, artboards 16 and 17): read in place, a long one folded
 * to its first screen with Read all, its headings as a little contents; written in the Markdown
 * box the app has today, saved as it is typed. `writing` opens the box with the cursor in it, as
 * "Write" from Notes to write asks.
 */
export function OccurrenceNotes({
  meeting: m,
  writing: asked = false,
}: {
  meeting: MeetingOccurrence
  writing?: boolean
}) {
  const today = useAccountToday()
  const notes = useQuery(seriesNotesQuery(m.meetingId))
  const note = notes.data?.find((n) => n.anchor?.occurrenceId === m.recurrenceId) ?? null
  const [writing, setWriting] = useState(asked)
  const day = m.startsLocal.slice(0, 10)
  const heads = note ? headingsOf(note.body) : []
  const body = useRef<HTMLDivElement>(null)
  return (
    <Block
      kind="note"
      title="Notes"
      count={
        <span className="flex items-center gap-2">
          <span>
            {weekdayOf(day, true)}, {shortDay(day, today)}
          </span>
          {note && note.words > 0 && <span>{words(note.words)}</span>}
        </span>
      }
      actions={
        <span className="flex items-center gap-1">
          {!writing &&
            heads.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() =>
                  [...(body.current?.querySelectorAll('h1, h2, h3') ?? [])]
                    .find((el) => el.textContent?.trim() === h)
                    ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
                }
                className="inline-flex h-6 items-center rounded-control bg-hover px-2 text-meta text-muted hover:text-ink"
              >
                {h}
              </button>
            ))}
          {!writing && (
            <button
              type="button"
              onClick={() => setWriting(true)}
              className={`${BUTTON.inline} text-meta`}
            >
              {note ? 'Edit' : 'Write'}
            </button>
          )}
        </span>
      }
    >
      {writing ? (
        <Writer meeting={m} note={note} onDone={() => setWriting(false)} />
      ) : note ? (
        <Folded note={note} body={body} />
      ) : (
        <p className="px-4 py-3 text-ui text-subtle">Nothing written for this one yet.</p>
      )}
    </Block>
  )
}

/** A note read in place: past its first screen it fades, and Read all unfolds it (FR-069). */
function Folded({
  note,
  body,
}: {
  note: NoteResponse
  body: React.RefObject<HTMLDivElement | null>
}) {
  const [all, setAll] = useState(false)
  const [long, setLong] = useState(false)
  useEffect(() => {
    const el = body.current
    if (el) setLong(el.scrollHeight > 300)
  }, [note.body, body])
  return (
    <div className="flex flex-col">
      <div
        ref={body}
        data-note-body
        className={`relative px-4 pt-3 pb-2 text-prose ${
          long && !all
            ? 'max-h-75 overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]'
            : ''
        }`}
      >
        <NoteBody source={note.body} />
      </div>
      <div className="flex items-center justify-between border-t border-line px-3 py-1.5">
        {long ? (
          <button type="button" onClick={() => setAll(!all)} className={BUTTON.inline}>
            <span className="inline-flex items-center gap-1.5">
              {all ? (
                <CollapseIcon size={14} aria-hidden="true" />
              ) : (
                <ExpandIcon size={14} aria-hidden="true" />
              )}
              {all ? 'Fold' : 'Read all'}
            </span>
          </button>
        ) : (
          <span />
        )}
        <Link
          to={`/notes/${note.id}`}
          className="inline-flex items-center gap-1 text-meta text-muted hover:text-ink"
        >
          Open in Notes
          <OpenFullIcon size={12} aria-hidden="true" />
        </Link>
      </div>
    </div>
  )
}

/**
 * The Markdown box, saved as it rests: the first words make the note, hung on this occurrence;
 * the rest rewrite it (FR-050, FR-067).
 */
function Writer({
  meeting: m,
  note,
  onDone,
}: {
  meeting: MeetingOccurrence
  note: NoteResponse | null
  onDone: () => void
}) {
  const qc = useQueryClient()
  const [text, setText] = useState(note?.body ?? '')
  const made = useRef<NoteResponse | null>(note)
  const save = useMutation({
    mutationFn: async (body: string) => {
      const saved = made.current
        ? await rewriteNote(made.current.id, body)
        : await writeOccurrenceNote(m.meetingId, m.recurrenceId, body)
      made.current = saved
      return saved
    },
    meta: { changes: ['note', 'meeting'], ownsError: true },
    onSuccess: (saved) =>
      qc.setQueryData(seriesNotesQuery(m.meetingId).queryKey, (was: NoteResponse[] = []) => [
        saved,
        ...was.filter((n) => n.id !== saved.id),
      ]),
  })
  const typed = useRef(text)
  typed.current = text
  useEffect(() => {
    if (text === (made.current?.body ?? '') || (text.trim() === '' && !made.current)) return
    const t = setTimeout(() => save.mutate(text), SAVE_AFTER_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a save per pause in the typing.
  }, [text])
  const finish = () => {
    if (typed.current !== (made.current?.body ?? '') && typed.current.trim() !== '')
      save.mutate(typed.current)
    void qc.invalidateQueries({ queryKey: meetingKeys.notes(m.meetingId) })
    onDone()
  }
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <textarea
        aria-label="Notes for this meeting"
        autoFocus
        value={text}
        rows={10}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            finish()
          }
        }}
        placeholder="What was said, what was decided, who does what"
        className={`${area} font-mono`}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-meta text-subtle" aria-live="polite">
          {save.isPending ? 'Saving…' : save.isError ? '' : made.current ? 'Saved' : ''}
        </span>
        <button type="button" onClick={finish} className={BUTTON.secondary}>
          Done
        </button>
      </div>
      {save.isError && (
        <p role="alert" className="text-ui text-stop-t">
          {problemText(save.error)}
        </p>
      )}
      <p className="flex items-start gap-2 rounded-control bg-hover px-3 py-2 text-meta text-muted">
        <KIND_ICON.note size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
        The full note editor arrives with the Notes module. Until then this is the Markdown editor
        you have today.
      </p>
    </div>
  )
}
