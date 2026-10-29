import type { MeetingOccurrence } from '@ctws/contracts'
import { linkWords } from '@ctws/core'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { monthDay } from '../../../platform/time/dates'
import { Block, BlockFailed } from '../../../platform/ui/Block'
import { boxed } from '../../../platform/ui/formStyles'
import { ForwardIcon, KIND_ICON, RepeatIcon } from '../../../platform/ui/icons'
import { earlierQuery, seriesNotesQuery } from '../api'
import { MEETINGS_ID } from '../logic/id'

/** The block shows this many before "All N earlier meetings" (FR-069). */
const SHOWN = 3

/** Where one occurrence opens. */
export const occurrenceTo = (m: Pick<MeetingOccurrence, 'meetingId' | 'recurrenceId'>) =>
  `/${MEETINGS_ID}/${m.meetingId}?${new URLSearchParams({ at: m.recurrenceId })}`

/**
 * EARLIER IN THIS SERIES (FR-067, FR-069, artboards 16 and 17): the occurrences before this one,
 * the latest first, each with its notes read in place, two lines of them; the first one without
 * any says so. The three latest show; the rest are the sidebar's, listed by month. Its search looks
 * through every note of the series.
 */
export function EarlierInSeries({ meeting: m }: { meeting: MeetingOccurrence }) {
  const earlier = useQuery(earlierQuery(m.meetingId, m.startsLocal.slice(0, 10)))
  const notes = useQuery(seriesNotesQuery(m.meetingId))
  const [asked, setAsked] = useState('')
  const rows = earlier.data ?? []
  if (!m.rrule || (earlier.isSuccess && rows.length === 0)) return null
  const noteOf = (o: MeetingOccurrence) =>
    notes.data?.find((n) => n.anchor?.occurrenceId === o.recurrenceId) ?? null
  const words = asked.trim().toLocaleLowerCase()
  const found = words
    ? rows.filter((o) => (noteOf(o)?.body ?? '').toLocaleLowerCase().includes(words))
    : rows.slice(0, SHOWN)
  const first = rows.at(-1)
  return (
    <Block
      badge={{ icon: RepeatIcon, tint: 'bg-hover text-muted' }}
      title="Earlier in this series"
      count={rows.length}
      actions={
        rows.length > SHOWN && (
          <input
            type="search"
            aria-label="Search these notes"
            placeholder="Search these notes"
            value={asked}
            onChange={(e) => setAsked(e.target.value)}
            className={`${boxed} h-7 w-56`}
          />
        )
      }
    >
      {earlier.isError ? (
        <BlockFailed what="earlier meetings" onRetry={() => void earlier.refetch()} />
      ) : (
        <ol className="flex flex-col py-1.5 [&>li:last-of-type>.thread]:hidden">
          {found.map((o) => {
            const note = noteOf(o)
            return (
              <li key={o.recurrenceId} className="relative">
                {/* The thread from one to the next (artboard 16, K-06); the last has none. */}
                <span
                  aria-hidden="true"
                  className="thread absolute top-9 -bottom-2 left-[calc(1rem+52px+0.625rem+11.5px)] w-px bg-line"
                />
                <Link
                  to={occurrenceTo(o)}
                  data-earlier={o.recurrenceId}
                  className="relative grid grid-cols-[52px_24px_minmax(0,1fr)] items-start gap-x-2.5 px-4 py-2 text-ui hover:bg-hover max-lg:min-h-11 max-lg:items-center"
                >
                  <time className="pt-0.5 font-mono text-meta text-muted tabular-nums">
                    {monthDay(o.startsLocal.slice(0, 10))}
                  </time>
                  <span
                    aria-hidden="true"
                    className={`inline-grid size-6 place-items-center rounded-control ${
                      note ? 'bg-note-bg text-note' : 'bg-hover text-muted'
                    }`}
                  >
                    <KIND_ICON.note size={14} />
                  </span>
                  <span className="line-clamp-2 min-w-0 text-ink">
                    {note
                      ? linkWords(
                          // What was said, not its headings (U-20): a heading's line goes.
                          note.body.replace(/^#+\s.*$/gm, '').replace(/^\s*[-*>]\s+/gm, ''),
                        )
                      : o === first
                        ? 'First meeting, no notes'
                        : 'No notes'}
                  </span>
                </Link>
              </li>
            )
          })}
          {words && found.length === 0 && (
            <li className="px-4 py-2 text-ui text-subtle">No notes in this series say that.</li>
          )}
        </ol>
      )}
      {!words && rows.length > SHOWN && (
        <Link
          to={`/${MEETINGS_ID}/${m.meetingId}?${new URLSearchParams({ at: m.recurrenceId, list: 'series' })}`}
          className="flex h-9 max-lg:h-11 items-center justify-between border-t border-line px-3 text-ui text-muted hover:bg-hover hover:text-ink"
        >
          All {rows.length} earlier meetings
          <ForwardIcon size={14} aria-hidden="true" />
        </Link>
      )}
    </Block>
  )
}
