import type { CalendarEntry } from '@ctws/contracts'
import { useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ViewTabs } from '../../platform/ui/ViewTabs'
import { useQuery } from '@tanstack/react-query'
import { calendarDays } from '../../modules/people/api/birthdays'
import { useEveryProject } from '../projects/api'
import { todayIn } from '../../platform/time/dueAt'
import { calendarProviders } from '../registry'
import { monthRange, monthSquares, monthTitle, shiftMonth, WEEKDAYS } from './monthGrid'
import { useProjectRail } from '../projects/projectColor'
import { useTimeZone } from '../auth/useMe'
import { useCrumbs } from '../layout/Location'

/**
 * THE CALENDAR -- a SHELL SURFACE, and the first one that is about every module at once.
 *
 * A LENS, not a place things live. It answers what is on this month by laying every module's dated
 * things on one grid; it owns none of them, and it is not where any of them is made. In a calendar
 * app an event is the only entity, so a "+" on the day square is the obvious way to make one; here
 * a meeting has its own page and a deadline is a property of a task, so making anything from the
 * grid would be a lens claiming a kind of thing.
 *
 * The shell draws the grid; each module says what it has on which day. The shell does not know
 * what a deadline is, nor how it differs from a day you mean to finish something: a module hands
 * over entries that already carry their day and their own word for the date, and both are shown
 * as given.
 *
 * WHAT IT DOES NOT DO, deliberately: no drag to reschedule (dragging a deadline and dragging a
 * plan are not the same act, and that has to be decided before it can be built), no week view, no
 * time axis (this app has no concept of a time slot -- a task has a day and a deadline instant),
 * no ics export. Each of those is a real feature, and none is needed to answer what is on which
 * day this month.
 */

/** How many entries a square shows before it says "+N". Three fits without scrolling. */
const PER_SQUARE = 3

export function Calendar() {
  useCrumbs([{ label: 'Calendar' }])
  const timeZone = useTimeZone()
  const today = todayIn(timeZone)
  const [cursor, setCursor] = useState(today)
  /** Which entry is open, and whose it is -- the module renders it, the shell only remembers. */
  const [open, setOpen] = useState<{ moduleId: string; id: string } | null>(null)
  const [params, setParams] = useSearchParams()
  const heading = useRef<HTMLHeadingElement>(null)
  const rail = useProjectRail()
  const projects = useEveryProject()

  const providers = calendarProviders()
  const range = monthRange(cursor)
  /**
   * WHAT EACH DAY IS CALLED IN THE OLD CALENDAR. One request per month, from the shell's own
   * endpoint: a day's name belongs to the day, not to whichever module put something on it. A
   * square whose label has not arrived (or failed) simply has no label, and is still a square.
   */
  const lunar = useQuery({
    queryKey: ['calendar-days', range.from, range.to],
    queryFn: () => calendarDays(range),
  })
  // ONE HOOK PER REGISTERED MODULE, over the registry's frozen list -- the same rule the capture
  // box and the rail counts follow.
  const results = providers.map((p) => ({ moduleId: p.moduleId, ...p.useEntries(range) }))
  // All, plus one tab per module. A single module would mean a tab bar that decides nothing, so
  // it is drawn only when there is a choice to make -- the same rule the project blocks keep.
  const views = [
    { id: 'all', label: 'All' },
    ...providers.map((p) => ({ id: p.moduleId, label: p.label })),
  ]
  const view = views.find((v) => v.id === params.get('view'))?.id ?? 'all'
  const pickView = (next: string) => {
    const copy = new URLSearchParams(params)
    if (next === 'all') copy.delete('view')
    else copy.set('view', next)
    setParams(copy, { replace: true })
  }

  const shown = results.filter((r) => view === 'all' || r.moduleId === view)
  const failed = shown.some((r) => r.isError)
  type Placed = CalendarEntry & { moduleId: string }
  const byDay = new Map<string, Placed[]>()
  for (const { moduleId, entries } of shown) {
    for (const entry of entries) {
      const placed = { ...entry, moduleId }
      const list = byDay.get(entry.day)
      if (list) list.push(placed)
      else byDay.set(entry.day, [placed])
    }
  }
  // Inside a square: the things with a clock first and in clock order, then the things that are
  // only about the day. A 14:00 meeting under a “Due” would be a square sorted by which module
  // answered first.
  for (const list of byDay.values()) {
    list.sort(
      (a, b) => (a.time ?? '99').localeCompare(b.time ?? '99') || a.title.localeCompare(b.title),
    )
  }

  const squares = monthSquares(cursor)

  /**
   * THE KEY: each project whose colour is on the grid, named once. A square has no room for a
   * project's name, so without it an entry's mark would be the only sign of its project (WCAG
   * 1.4.1). Only what is DRAWN counts -- an entry folded into "+N" puts no colour on the grid --
   * and the order is the rail's, so a project sits where it always does.
   */
  const order = new Map(projects.data?.map((p, i) => [p.id, i]))
  const keyed = new Map<string, string>()
  for (const { day } of squares)
    for (const entry of (byDay.get(day) ?? []).slice(0, PER_SQUARE))
      if (entry.projectId && entry.projectName && !keyed.has(entry.projectId))
        keyed.set(entry.projectId, entry.projectName)
  const key = [...keyed].sort(([a], [b]) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity))

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-2xl font-semibold tracking-[-0.02em] focus:outline-none"
        >
          Calendar
        </h1>
        <span className="text-sm text-ink-muted tabular-nums">{monthTitle(cursor)}</span>
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
        {views.length > 2 && (
          <span className="ml-auto">
            <ViewTabs views={views} current={view} onPick={pickView} />
          </span>
        )}
      </div>

      {failed && (
        <p role="alert" className="mt-3 text-sm text-danger">
          Some entries failed to load
        </p>
      )}

      {key.length > 0 && (
        <ul aria-label="Projects on this calendar" className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {key.map(([id, name]) => (
            <li key={id} className="flex min-w-0 items-center gap-1.5 text-xs text-ink-muted">
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

      <div className="mt-4 min-w-0 overflow-hidden border border-rule bg-sheet">
        <div className="grid grid-cols-7">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-1.5 text-xs text-ink-subtle">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 border-t border-rule">
          {squares.map(({ day, inMonth }, i) => {
            const entries = byDay.get(day) ?? []
            const isToday = day === today
            return (
              <div
                key={day}
                aria-label={day}
                data-day={day}
                className={`group relative min-h-24 min-w-0 border-rule p-1 ${
                  i % 7 === 6 ? '' : 'border-r'
                } ${i < squares.length - 7 ? 'border-b' : ''} ${inMonth ? '' : 'bg-desk'}`}
              >
                <div
                  className={`px-1 text-xs tabular-nums ${
                    isToday
                      ? 'font-semibold text-ink'
                      : inMonth
                        ? 'text-ink-muted'
                        : 'text-ink-subtle'
                  }`}
                >
                  {Number(day.slice(8))}
                  {lunar.data?.[day] && (
                    <span
                      data-lunar-day
                      // On the scale's caption step, in the tertiary ink whole: an out-of-month
                      // square already sits on the desk, which is what says "not this month".
                      className="ml-1.5 text-xs text-ink-subtle"
                    >
                      {lunar.data[day]}
                    </span>
                  )}
                </div>
                <ul className="flex flex-col">
                  {entries.slice(0, PER_SQUARE).map((entry) => (
                    <li key={entry.id} className="min-w-0">
                      <EntryLink
                        entry={entry}
                        onOpen={() => setOpen({ moduleId: entry.moduleId, id: entry.id })}
                        opens={providers.some(
                          (p) => p.moduleId === entry.moduleId && p.Detail !== undefined,
                        )}
                      >
                        {/* The project's identity colour. A calendar is cross-project by nature,
                            which is exactly where this chip earns its place -- and it is never
                            alone: the key above the grid names it (WCAG 1.4.1). */}
                        {/* The slot is reserved whether or not the entry has a project, so every
                            title in a square starts at the same x -- the rule the task rows keep
                            about their leading glyph. */}
                        <span
                          aria-hidden="true"
                          data-entry-mark
                          // Square: the thread's shape, the project's colour. Round is for markers.
                          className={`h-3 w-[3px] shrink-0 ${
                            entry.projectId ? rail(entry.projectId) : ''
                          }`}
                        />
                        {entry.time && (
                          <span className="shrink-0 text-xs tabular-nums text-ink-muted">
                            {entry.time}
                          </span>
                        )}
                        <span className="truncate text-xs text-ink">{entry.title}</span>
                        {entry.projectName && (
                          <span className="sr-only">, {entry.projectName}</span>
                        )}
                        {/* The zone it was AGREED in, when that is not the one the clock above is
                            in. The time says when to turn up; this says what was actually said. */}
                        {entry.zone && (
                          <span className="shrink-0 text-xs text-ink-subtle">{entry.zone}</span>
                        )}
                      </EntryLink>
                    </li>
                  ))}
                  {entries.length > PER_SQUARE && (
                    <li className="px-1 text-xs text-ink-subtle">+{entries.length - PER_SQUARE}</li>
                  )}
                </ul>
              </div>
            )
          })}
        </div>
      </div>

      {providers.map(({ moduleId, Detail }) =>
        Detail && open?.moduleId === moduleId ? (
          <Detail key={moduleId} id={open.id} onClose={() => setOpen(null)} />
        ) : null,
      )}
    </>
  )
}

/**
 * An entry on the grid: a BUTTON when its module opens it here, a LINK when the thing belongs
 * somewhere else. A deadline is a property of a task and the task's list is where you deal with
 * it; a meeting has nowhere else to be.
 */
function EntryLink({
  entry,
  opens,
  onOpen,
  children,
}: {
  entry: CalendarEntry
  opens: boolean
  onOpen: () => void
  children: ReactNode
}) {
  // The project by name, beside the colour the entry wears (WCAG 1.4.1): in the tooltip, and
  // in the entry's own name, which a square has no room to print.
  const title = [entry.kind, entry.title, entry.projectName].filter(Boolean).join(' · ')
  const className =
    'flex w-full min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-left hover:bg-hover'
  return opens ? (
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
      // The control shape Review's week stepper has: one stepper, one look across the app.
      className="flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm text-ink-muted hover:bg-hover hover:text-ink"
    >
      {children}
    </button>
  )
}
