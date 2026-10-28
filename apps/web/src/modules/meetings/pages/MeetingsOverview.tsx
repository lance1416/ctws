import type { MeetingOccurrence } from '@ctws/contracts'
import { clockTime } from '@ctws/core/clock'
import { addDays } from '@ctws/core/day'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useContext, useState } from 'react'
import { Link } from 'react-router-dom'
import { monthDay, weekdayOf, ymd } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { Block, BlockFailed } from '../../../platform/ui/Block'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import { EditIcon, KIND_ICON, NewIcon } from '../../../platform/ui/icons'
import { PageHead } from '../../../platform/ui/PageHead'
import { useTimeZone } from '../../../shell/auth'
import { NewContext } from '../../../shell/creates'
import { ProjectSquare, useEveryProject } from '../../../shell/projects'
import { useRegistry } from '../../../shell/registry'
import { meetingsQuery, seriesNotesQuery } from '../api'
import { occurrenceTo } from '../components/EarlierInSeries'

/** Each block shows this many before "All N" (FR-011). */
const SHOWN = 5

/** How far back a meeting held without notes is still one to write (FR-066). */
const WRITE_BACK_DAYS = 14

/**
 * THE MEETINGS OVERVIEW (FR-066, artboard 18): what is coming this week, and which meetings held
 * still have no notes, each a press away from writing them.
 */
export function MeetingsOverview() {
  const openNew = useContext(NewContext)
  const creator = useRegistry().creates.find((c) => c.kind === 'meeting')
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <PageHead>Meetings</PageHead>
        </div>
        {creator && (
          <button
            type="button"
            onClick={() => openNew(creator, { opens: true })}
            className={BUTTON.secondary}
          >
            <NewIcon size={16} aria-hidden="true" />
            New meeting
          </button>
        )}
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <NextSeven />
        <NotesToWrite />
      </div>
    </div>
  )
}

/** "All N": the rest of a block, in place. */
function More({ rows, shown, onAll }: { rows: number; shown: number; onAll: () => void }) {
  if (rows <= shown) return null
  return (
    <button
      type="button"
      onClick={onAll}
      className="flex h-9 w-full items-center border-t border-line px-3 text-ui text-muted hover:bg-hover hover:text-ink"
    >
      All {rows}
    </button>
  )
}

function NextSeven() {
  const zone = useTimeZone()
  const now = useNow()
  const today = ymd(now, zone)
  const week = useQuery(meetingsQuery({ from: today, to: addDays(today, 6) }))
  const projects = useEveryProject()
  const [all, setAll] = useState(false)
  const rows = (week.data ?? []).filter((m) => new Date(m.endsAt) > now)
  const shown = all ? rows : rows.slice(0, SHOWN)
  return (
    <Block
      kind="meeting"
      title="The next 7 days"
      count={rows.length}
      empty={week.isSuccess && rows.length === 0 ? 'None' : null}
    >
      {week.isError ? (
        <BlockFailed what="meetings" onRetry={() => void week.refetch()} />
      ) : (
        <ul className="flex flex-col py-1.5">
          {shown.map((m) => {
            const start = new Date(m.startsAt)
            const project = projects.data?.find((p) => p.id === m.projectId)
            return (
              <li key={`${m.meetingId}@${m.recurrenceId}`}>
                <Link
                  to={occurrenceTo(m)}
                  data-next-meeting
                  className="grid min-h-9 grid-cols-[2.5rem_3rem_minmax(0,1fr)_auto] items-center gap-x-3 px-3 text-ui hover:bg-hover"
                >
                  <span className="font-mono text-meta text-meeting-t">
                    {weekdayOf(ymd(start, zone), true)}
                  </span>
                  <span className="font-mono text-meta text-muted tabular-nums">
                    {clockTime(start, zone)}
                  </span>
                  <span className="truncate text-ink">{m.title}</span>
                  {project ? <ProjectSquare project={project} /> : <span />}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      <More rows={rows.length} shown={shown.length} onAll={() => setAll(true)} />
    </Block>
  )
}

/** Meetings held in the last two weeks with nothing written for them yet (FR-066). */
function NotesToWrite() {
  const zone = useTimeZone()
  const now = useNow()
  const today = ymd(now, zone)
  const held = useQuery(meetingsQuery({ from: addDays(today, -WRITE_BACK_DAYS), to: today }))
  const over = (held.data ?? []).filter((m) => new Date(m.endsAt) <= now)
  const series = [...new Set(over.map((m) => m.meetingId))]
  const notes = useQueries({ queries: series.map((id) => seriesNotesQuery(id)) })
  const [all, setAll] = useState(false)
  const written = (m: MeetingOccurrence) => {
    const of = notes[series.indexOf(m.meetingId)]
    return of?.data?.some((n) => n.anchor?.occurrenceId === m.recurrenceId) ?? true
  }
  const ready = held.isSuccess && notes.every((n) => n.isSuccess)
  const rows = ready
    ? over.filter((m) => !written(m)).sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    : []
  const shown = all ? rows : rows.slice(0, SHOWN)
  return (
    <Block
      kind="note"
      title="Notes to write"
      count={rows.length}
      empty={ready && rows.length === 0 ? 'None' : null}
    >
      <ul className="flex flex-col py-1.5">
        {shown.map((m) => (
          <li
            key={`${m.meetingId}@${m.recurrenceId}`}
            data-to-write
            className="grid min-h-10 grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-x-3 px-3 text-ui"
          >
            <span className="font-mono text-meta text-muted tabular-nums">
              {monthDay(ymd(new Date(m.startsAt), zone))}
            </span>
            <span className="flex min-w-0 items-center gap-2 text-ink">
              <KIND_ICON.meeting size={14} aria-hidden="true" className="shrink-0 text-meeting" />
              <span className="truncate">{m.title}</span>
            </span>
            <Link
              to={`${occurrenceTo(m)}&write=1`}
              aria-label={`Write the notes for ${m.title}, ${monthDay(ymd(new Date(m.startsAt), zone))}`}
              className="inline-flex h-7 items-center gap-1.5 rounded-control border border-line-strong px-2.5 text-meta font-medium text-ink hover:bg-hover"
            >
              <EditIcon size={12} aria-hidden="true" />
              Write
            </Link>
          </li>
        ))}
      </ul>
      <More rows={rows.length} shown={shown.length} onAll={() => setAll(true)} />
    </Block>
  )
}
