import type { ProjectId } from '@ctws/contracts'
import type { ShownEntry } from '../contract'
import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useViewParam, ViewTabs } from '../../platform/ui/ViewTabs'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { calendarDaysQuery } from './api'
import { useEveryProject } from '../projects/api'
import { ymd } from '../../platform/time/dates'
import { useRegistry } from '../registry'
import { monthRange, monthSquares, monthTitle, shiftMonth, WEEKDAYS } from './monthGrid'
import { useProjectRail } from '../projects/projectColor'
import { useTimeZone } from '../auth/useMe'
import { useNow } from '../../platform/time/useNow'
import { PageHead } from '../../platform/ui/PageHead'

/** Entries a square shows before it says "+N"; three fit without scrolling. */
const PER_SQUARE = 3

/**
 * Every module's dated things on one month grid, each entry with the day and wording its module
 * gave it. Nothing is made here: a meeting has its own page and a deadline belongs to a task.
 */
export function Calendar() {
  const timeZone = useTimeZone()
  const today = ymd(useNow(), timeZone)
  const [cursor, setCursor] = useState(today)
  const setParams = useSearchParams()[1]
  const rail = useProjectRail()
  const projects = useEveryProject()

  const providers = useRegistry().calendar
  const range = monthRange(cursor)
  // Each day's lunar-calendar name; a square whose name failed to load simply has none. Like every
  // module's entries, the month stepped away from stays drawn until the next one is in.
  const lunar = useQuery({ ...calendarDaysQuery(range), placeholderData: keepPreviousData })
  // One hook per registered module; the registry's list is fixed, so the hook order is too.
  const results = providers.map((p) => ({ moduleId: p.moduleId, ...p.useEntries(range) }))
  const views = [
    { id: 'all', label: 'All' },
    ...providers.map((p) => ({ id: p.moduleId, label: p.label })),
  ]
  const [view, pickView] = useViewParam(views)

  const shown = results.filter((r) => view === 'all' || r.moduleId === view)
  const failed = shown.some((r) => r.isError)
  type Placed = ShownEntry & { moduleId: string }
  const byDay = new Map<string, Placed[]>()
  for (const { moduleId, entries } of shown) {
    for (const entry of entries) {
      const placed = { ...entry, moduleId }
      const list = byDay.get(entry.day)
      if (list) list.push(placed)
      else byDay.set(entry.day, [placed])
    }
  }
  // Timed entries first, in clock order; '99' puts the untimed ones after them.
  for (const list of byDay.values()) {
    list.sort(
      (a, b) => (a.time ?? '99').localeCompare(b.time ?? '99') || a.title.localeCompare(b.title),
    )
  }

  const squares = monthSquares(cursor)

  // The key names each project whose colour is drawn, so the colour is never the only sign of it.
  // An entry folded into "+N" draws none; the order is the rail's.
  const order = new Map(projects.data?.map((p, i) => [p.id, i]))
  const keyed = new Map<ProjectId, string>()
  for (const { day } of squares)
    for (const entry of (byDay.get(day) ?? []).slice(0, PER_SQUARE))
      if (entry.projectId && entry.projectName && !keyed.has(entry.projectId))
        keyed.set(entry.projectId, entry.projectName)
  const key = [...keyed].sort(([a], [b]) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity))

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <PageHead>Calendar</PageHead>
        <span className="text-ui text-muted tabular-nums">{monthTitle(cursor)}</span>
        <span className="flex items-center gap-1">
          <Step label="Previous month" onClick={() => setCursor(shiftMonth(cursor, -1))}>
            ‹
          </Step>
          <Step label="Back to this month" onClick={() => setCursor(today)}>
            This month
          </Step>
          <Step label="Next month" onClick={() => setCursor(shiftMonth(cursor, 1))}>
            ›
          </Step>
        </span>
        <span className="ml-auto">
          <ViewTabs views={views} current={view} onPick={pickView} />
        </span>
      </div>

      {failed && (
        <p role="alert" className="mt-3 text-ui text-stop-t">
          Some entries failed to load
        </p>
      )}

      {key.length > 0 && (
        <ul aria-label="Projects on this calendar" className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {key.map(([id, name]) => (
            <li key={id} className="flex min-w-0 items-center gap-1.5 text-meta text-muted">
              <span
                aria-hidden="true"
                data-key-mark
                className={`h-3 w-[3px] shrink-0 ${rail(id)}`}
              />
              {name}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 min-w-0 overflow-hidden border border-line bg-panel">
        <div className="grid grid-cols-7">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-1.5 text-meta text-subtle">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 border-t border-line">
          {squares.map(({ day, inMonth }, i) => {
            const entries = byDay.get(day) ?? []
            const isToday = day === today
            return (
              <div
                key={day}
                aria-label={day}
                data-day={day}
                className={`group relative min-h-24 min-w-0 border-line p-1 ${
                  i % 7 === 6 ? '' : 'border-r'
                } ${i < squares.length - 7 ? 'border-b' : ''} ${inMonth ? '' : 'bg-ground'}`}
              >
                <div
                  className={`px-1 text-meta tabular-nums ${
                    isToday ? 'font-medium text-ink' : inMonth ? 'text-muted' : 'text-subtle'
                  }`}
                >
                  {Number(day.slice(8))}
                  {lunar.data?.[day] && (
                    <span data-lunar-day className="ml-1.5 text-meta text-subtle">
                      {lunar.data[day]}
                    </span>
                  )}
                </div>
                <ul className="flex flex-col">
                  {entries.slice(0, PER_SQUARE).map((entry) => {
                    const opens = providers.find((p) => p.moduleId === entry.moduleId)?.opens
                    return (
                      <li key={entry.key} className="min-w-0">
                        <EntryLink
                          entry={entry}
                          onOpen={
                            opens &&
                            (() =>
                              setParams((prev) => {
                                const out = new URLSearchParams(prev)
                                for (const [k, v] of Object.entries(opens.params(entry)))
                                  out.set(k, v)
                                return out
                              }))
                          }
                        >
                          {/* Kept with no project too, so every title starts at one x. */}
                          <span
                            aria-hidden="true"
                            data-entry-mark
                            className={`h-3 w-[3px] shrink-0 ${
                              entry.projectId ? rail(entry.projectId) : ''
                            }`}
                          />
                          {entry.time && (
                            <span className="shrink-0 text-meta tabular-nums text-muted">
                              {entry.time}
                            </span>
                          )}
                          <span className="truncate text-meta text-ink">{entry.title}</span>
                          {entry.projectName && (
                            <span className="sr-only">, {entry.projectName}</span>
                          )}
                          {/* The zone it was agreed in, when that differs from the account's. */}
                          {entry.zone && (
                            <span className="shrink-0 text-meta text-subtle">{entry.zone}</span>
                          )}
                        </EntryLink>
                      </li>
                    )
                  })}
                  {entries.length > PER_SQUARE && (
                    <li className="px-1 text-meta text-subtle">+{entries.length - PER_SQUARE}</li>
                  )}
                </ul>
              </div>
            )
          })}
        </div>
      </div>

      {providers.map(({ moduleId, opens }) => opens && <opens.Pane key={moduleId} />)}
    </>
  )
}

/** A button when the entry's module opens it here, a link when the thing lives elsewhere. */
function EntryLink({
  entry,
  onOpen,
  children,
}: {
  entry: ShownEntry
  onOpen: (() => void) | undefined
  children: ReactNode
}) {
  const title = [entry.label, entry.title, entry.projectName].filter(Boolean).join(' · ')
  const className =
    'flex w-full min-w-0 items-center gap-1 rounded-control px-1 py-0.5 text-left hover:bg-hover'
  return onOpen ? (
    <button type="button" onClick={onOpen} title={title} className={className}>
      {children}
    </button>
  ) : (
    <Link to={entry.to} title={title} className={className}>
      {children}
    </Link>
  )
}

function Step({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-8 min-w-8 items-center justify-center rounded-control px-2 text-ui text-muted hover:bg-hover hover:text-ink"
    >
      {children}
    </button>
  )
}
