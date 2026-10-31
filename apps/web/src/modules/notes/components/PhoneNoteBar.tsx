import type { NoteFolderId, NoteResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { type RefObject, useState } from 'react'
import { Link } from 'react-router-dom'
import type { EditorHandle } from '../../../platform/editor/MarkdownEditor'
import type { Heading } from '../../../platform/editor/outline'
import { problemText } from '../../../platform/http/api'
import { BottomSheet } from '../../../platform/ui/BottomSheet'
import { ICON_BUTTON } from '../../../platform/ui/buttonStyles'
import { BackIcon, MoreIcon, TreeIcon } from '../../../platform/ui/icons'
import { foldersQuery } from '../api'
import { useFolderActions } from '../hooks/useFolderActions'
import { useShelveNote } from '../hooks/useShelveNote'
import { NOTES_ID } from '../logic/id'
import { FolderNameField } from './FolderNameField'
import { downloadNote } from './NoteMenu'
import { sourceWords } from '../../../platform/editor/SourceButton'

const ROW =
  'flex min-h-12 w-full items-center gap-3 px-4 text-left text-prose text-ink active:bg-hover'

/**
 * A NOTE'S BAR ON A PHONE (REQ-002 FR-109 to FR-111, artboard 35): "‹ Notes", then the outline
 * and "…", which open one sheet: the outline, a heading a tap away, then the note's own actions.
 */
export function PhoneNoteBar({
  note,
  headings,
  editor,
  title,
  body,
  source,
  onSource,
}: {
  note: NoteResponse | null
  headings: readonly Heading[]
  editor: RefObject<EditorHandle | null>
  title: string
  body: string
  /** The note shown as its source (FR-116), and the switch, here only in the sheet. */
  source: boolean
  onSource: () => void
}) {
  const [sheet, setSheet] = useState<'actions' | 'folders' | null>(null)
  const shelve = useShelveNote()
  const own = note !== null && note.anchor === null
  return (
    <div className="-mt-1 flex min-h-11 items-center gap-1 lg:hidden">
      <Link
        to={`/${NOTES_ID}`}
        className="-ml-1 flex min-h-11 flex-1 items-center gap-1 text-prose text-task-t"
      >
        <BackIcon size={20} aria-hidden="true" />
        Notes
      </Link>
      {headings.length > 0 && (
        <button
          type="button"
          aria-label="Outline"
          onClick={() => setSheet('actions')}
          className={ICON_BUTTON}
        >
          <TreeIcon size={20} aria-hidden="true" />
        </button>
      )}
      {note && (
        <button
          type="button"
          aria-label="More"
          onClick={() => setSheet('actions')}
          className={ICON_BUTTON}
        >
          <MoreIcon size={20} aria-hidden="true" />
        </button>
      )}
      {sheet === 'actions' && (
        <BottomSheet
          title={headings.length > 0 ? 'Outline' : 'Note'}
          onClose={() => setSheet(null)}
        >
          {headings.length > 0 && (
            <ul aria-label="Outline" className="border-b border-line py-1">
              {headings.map((h) => (
                <li key={h.offset}>
                  <button
                    type="button"
                    onClick={() => {
                      setSheet(null)
                      editor.current?.goTo(h.offset)
                    }}
                    className={`${ROW} ${h.depth === 2 ? 'pl-8' : ''}`}
                  >
                    {h.words}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <ul className="py-1 pb-2">
            <li>
              <button
                type="button"
                onClick={() => {
                  onSource()
                  setSheet(null)
                }}
                className={ROW}
              >
                {sourceWords(source)}
              </button>
            </li>
            {own && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    shelve.mutate({ id: note.id, pinned: note.pinnedAt === null })
                    setSheet(null)
                  }}
                  className={ROW}
                >
                  {note.pinnedAt === null ? 'Pin' : 'Unpin'}
                </button>
              </li>
            )}
            {own && (
              <li>
                <button type="button" onClick={() => setSheet('folders')} className={ROW}>
                  Move to a folder…
                </button>
              </li>
            )}
            <li>
              <button
                type="button"
                onClick={() => {
                  downloadNote(title, body)
                  setSheet(null)
                }}
                className={ROW}
              >
                Download as .md
              </button>
            </li>
          </ul>
        </BottomSheet>
      )}
      {sheet === 'folders' && own && <FolderSheet note={note} onClose={() => setSheet(null)} />}
    </div>
  )
}

/** Move to a folder…, on a phone: each folder, the one it is in ticked; none; a new one. */
function FolderSheet({ note, onClose }: { note: NoteResponse; onClose: () => void }) {
  const folders = useQuery(foldersQuery()).data ?? []
  const shelve = useShelveNote()
  const actions = useFolderActions()
  const [making, setMaking] = useState(false)
  const put = (folderId: NoteFolderId | null) => {
    shelve.mutate({ id: note.id, folderId })
    onClose()
  }
  return (
    <BottomSheet title="Move to a folder" onClose={onClose}>
      <ul className="py-1 pb-2">
        {folders.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              aria-pressed={note.folderId === f.id}
              onClick={() => put(f.id)}
              className={ROW}
            >
              <span className="flex-1 truncate">{f.name}</span>
              {note.folderId === f.id && <span className="text-muted">✓</span>}
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            aria-pressed={note.folderId === null}
            onClick={() => put(null)}
            className={ROW}
          >
            <span className="flex-1">No folder</span>
            {note.folderId === null && <span className="text-muted">✓</span>}
          </button>
        </li>
        <li className="px-2.5 pt-1">
          {making ? (
            <FolderNameField
              label="New folder"
              error={actions.create.isError ? problemText(actions.create.error) : null}
              onCommit={(name) =>
                actions.create.mutate({ name, forNote: note.id }, { onSuccess: onClose })
              }
              onCancel={() => {
                actions.create.reset()
                setMaking(false)
              }}
            />
          ) : (
            <button type="button" onClick={() => setMaking(true)} className={`${ROW} -mx-2.5`}>
              New folder…
            </button>
          )}
        </li>
      </ul>
    </BottomSheet>
  )
}
