import type { ReadingItemResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { Link, NavLink, useSearchParams } from 'react-router-dom'
import { BackIcon, KIND_ICON, LinkIcon } from '../../../platform/ui/icons'
import { ICON_BUTTON } from '../../../platform/ui/buttonStyles'
import { readingQuery } from '../api'
import { isToRead, readingLabel } from '../logic/item'

const ROW = ({ isActive }: { isActive: boolean }) =>
  `mx-1.5 flex h-7.5 items-center gap-2 rounded-control px-2 text-ui hover:bg-hover ${
    isActive ? 'bg-select font-medium text-ink' : 'text-ink'
  }`

/**
 * The Reading sidebar's list (FR-072): what you are reading, then what is waiting; from "N
 * finished" (`?list=finished`), what is finished, and what was dropped in a part of its own.
 */
export function ReadingSidebar() {
  const items = useQuery(readingQuery())
  const [params] = useSearchParams()
  const rows = items.data ?? []
  const finished = params.get('list') === 'finished'
  const of = (status: ReadingItemResponse['status']) => rows.filter((i) => i.status === status)
  const keep = finished ? '?list=finished' : ''
  const parts = finished
    ? [
        { label: 'Finished', rows: of('done') },
        { label: 'Dropped', rows: of('dropped') },
      ]
    : [
        { label: 'Reading', rows: of('reading') },
        { label: 'To read', rows: of('todo') },
      ]
  return (
    <nav
      aria-label="Reading"
      className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2 *:shrink-0"
    >
      {finished && (
        <div className="mx-1.5 mb-1 flex h-8 items-center gap-1.5">
          <Link to="/reading" aria-label="Back to what is being read" className={ICON_BUTTON}>
            <BackIcon size={16} aria-hidden="true" />
          </Link>
          <span className="flex-1 text-ui font-medium text-ink">Finished</span>
        </div>
      )}
      {parts.map(
        (part) =>
          part.rows.length > 0 && (
            <section key={part.label} aria-label={part.label}>
              <h3 className="flex items-center px-3.5 pt-2 pb-1 text-meta text-muted">
                <span className="flex-1">{part.label}</span>
                <span className="tabular-nums">{part.rows.length}</span>
              </h3>
              <ul className="flex flex-col gap-px">
                {part.rows.map((i) => {
                  const Icon = i.kind === 'book' ? KIND_ICON.reading : LinkIcon
                  return (
                    <li key={i.id} data-reading-row={i.id}>
                      <NavLink to={`/reading/${i.id}${keep}`} className={ROW}>
                        <Icon size={14} aria-hidden="true" className="shrink-0 text-reading" />
                        <span className="flex-1 truncate">{readingLabel(i)}</span>
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            </section>
          ),
      )}
    </nav>
  )
}

/** What a phone's More says beside Reading (FR-085): what is being read and what waits to be. */
export function ReadingMoreCount() {
  const reading = useQuery(readingQuery())
  if (!reading.data) return null
  return <span data-count>{reading.data.filter(isToRead).length}</span>
}
