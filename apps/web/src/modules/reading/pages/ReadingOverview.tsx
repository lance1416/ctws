import { idFrom, personId } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { monthDay, ymd } from '../../../platform/time/dates'
import { Block, BlockFailed } from '../../../platform/ui/Block'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import { DoneIcon, KIND_ICON, LinkIcon, NewIcon } from '../../../platform/ui/icons'
import { PageHead } from '../../../platform/ui/PageHead'
import { useTimeZone } from '../../../shell/auth'
import { openCapture } from '../../../shell/capture'
import { ModuleEmpty } from '../../../shell/layout'
import { readingQuery } from '../api'
import { AddReading } from '../components/AddReading'
import { byline, ReadingCard } from '../components/ReadingCard'
import { nameBesideSite } from '../logic/item'

/** The To read block shows this many before "All N" (FR-072). */
const SHOWN = 5

/**
 * THE READING OVERVIEW (FR-072, artboard 18): what you are in the middle of, a card each; what is
 * waiting, the latest added first; and how many are finished, a way into the sidebar's list of
 * them. Added from a person's page, the line to add with says it is what they recommended.
 */
export function ReadingOverview() {
  const items = useQuery(readingQuery())
  const [params] = useSearchParams()
  const recommender = params.get('recommendedBy')
  const by = recommender
    ? { id: idFrom(personId, recommender), name: params.get('by') ?? 'them' }
    : null
  const rows = items.data ?? []
  if (items.isSuccess && rows.length === 0 && !by)
    return <ModuleEmpty kind="reading" onNew={() => openCapture('reading')} says="Add reading" />
  const reading = rows.filter((i) => i.status === 'reading')
  // Read to the end, not given up on: what was dropped is apart in the sidebar (BUG-055).
  const finished = rows.filter((i) => i.status === 'done').length
  const dropped = rows.filter((i) => i.status === 'dropped').length
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <PageHead>Reading</PageHead>
        </div>
        <button type="button" onClick={() => openCapture('reading')} className={BUTTON.secondary}>
          <NewIcon size={16} aria-hidden="true" />
          Add reading
        </button>
      </div>
      {by && (
        <div className="max-w-[52ch]">
          <AddReading recommendedBy={by} />
        </div>
      )}
      {items.isError ? (
        <BlockFailed what="reading" onRetry={() => void items.refetch()} />
      ) : (
        <>
          {reading.length > 0 && (
            <section aria-label="Reading now" className="grid items-stretch gap-3 lg:grid-cols-2">
              {reading.map((i) => (
                <ReadingCard key={i.id} item={i} />
              ))}
            </section>
          )}
          <ToRead />
          {(finished > 0 || dropped > 0) && (
            <Link
              to="/reading?list=finished"
              className="inline-flex items-center gap-3 self-start text-meta text-muted hover:text-ink"
            >
              {finished > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <DoneIcon size={12} aria-hidden="true" />
                  {finished} finished
                </span>
              )}
              {/* Given up on is not read: counted apart (R-01). */}
              {dropped > 0 && <span>{dropped} dropped</span>}
            </Link>
          )}
        </>
      )}
    </div>
  )
}

function ToRead() {
  const items = useQuery(readingQuery())
  const zone = useTimeZone()
  const [all, setAll] = useState(false)
  const rows = (items.data ?? [])
    .filter((i) => i.status === 'todo')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const shown = all ? rows : rows.slice(0, SHOWN)
  return (
    <Block
      badge={{ icon: KIND_ICON.reading, tint: 'bg-reading-bg text-reading' }}
      title="To read"
      count={rows.length}
      empty={items.isSuccess && rows.length === 0 ? 'Nothing waiting' : null}
    >
      <ul className="flex flex-col py-1.5">
        {shown.map((i) => {
          const Icon = i.kind === 'book' ? KIND_ICON.reading : LinkIcon
          return (
            <li key={i.id}>
              <Link
                to={`/reading/${i.id}`}
                data-to-read={i.id}
                className="grid min-h-9 grid-cols-[16px_minmax(0,2fr)_minmax(0,1fr)_3.5rem] items-center gap-x-3 px-3 text-ui hover:bg-hover"
              >
                <Icon size={16} aria-hidden="true" className="text-reading" />
                <span className="truncate text-ink">{nameBesideSite(i)}</span>
                <span className="truncate text-meta text-muted">{byline(i) ?? ''}</span>
                <span className="text-right font-mono text-meta text-muted tabular-nums">
                  {monthDay(ymd(new Date(i.createdAt), zone))}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
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
  )
}
