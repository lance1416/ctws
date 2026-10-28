import type { NoteResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { monthDay, ymd } from '../../../platform/time/dates'
import { Block, BlockFailed } from '../../../platform/ui/Block'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import { KIND_ICON, NewIcon } from '../../../platform/ui/icons'
import { KIND_TEXT } from '../../../platform/ui/kinds'
import { PageHead } from '../../../platform/ui/PageHead'
import { useTimeZone } from '../../../shell/auth'
import { ModuleEmpty } from '../../../shell/layout'
import { notesQuery } from '../api'
import { NOTES_ID } from '../logic/id'
import { noteTitle } from '../logic/title'

/** Recent shows this many before "All N". */
const SHOWN = 5

/**
 * THE NOTES OVERVIEW (FR-074, artboard 18): the latest notes, each with what it hangs on and its
 * day. No folders and no pinning: those come with the Notes batch (FR-103).
 */
export function NotesOverview() {
  const notes = useQuery(notesQuery())
  const zone = useTimeZone()
  const [all, setAll] = useState(false)
  const rows = notes.data ?? []
  if (notes.isSuccess && rows.length === 0) return <ModuleEmpty kind="note" />
  const shown = all ? rows : rows.slice(0, SHOWN)
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <PageHead>Notes</PageHead>
        </div>
        <Link to={`/${NOTES_ID}/new`} className={BUTTON.secondary}>
          <NewIcon size={16} aria-hidden="true" />
          New note
        </Link>
      </div>
      <Block kind="note" title="Recent" count={rows.length}>
        {notes.isError ? (
          <BlockFailed what="notes" onRetry={() => void notes.refetch()} />
        ) : (
          <ul className="flex flex-col py-1.5">
            {shown.map((n) => (
              <li key={n.id}>
                <Link
                  to={`/${NOTES_ID}/${n.id}`}
                  data-note-row={n.id}
                  className="grid min-h-9 grid-cols-[minmax(0,1fr)_minmax(0,14rem)_3.5rem] items-center gap-x-3 px-3 text-ui hover:bg-hover"
                >
                  <span className="truncate text-ink">{noteTitle(n)}</span>
                  <Anchor note={n} />
                  <span className="text-right font-mono text-meta text-muted tabular-nums">
                    {monthDay(ymd(new Date(n.updatedAt), zone))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {rows.length > shown.length && (
          <button
            type="button"
            onClick={() => setAll(true)}
            className="flex h-9 w-full items-center border-t border-line px-3 text-ui text-muted hover:bg-hover hover:text-ink"
          >
            All {rows.length}
          </button>
        )}
      </Block>
    </div>
  )
}

/** What a note hangs on, by its kind's icon and name; nothing for one on its own. */
function Anchor({ note }: { note: NoteResponse }) {
  const a = note.anchor
  if (!a) return <span />
  const Icon = KIND_ICON[a.type]
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-meta text-muted">
      <Icon size={12} aria-hidden="true" className={`shrink-0 ${KIND_TEXT[a.type]}`} />
      <span className="truncate">{a.title ?? 'Something gone'}</span>
    </span>
  )
}
