import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { longDay, ymd } from '../../platform/time/dates'
import { useNow } from '../../platform/time/useNow'
import { CHOSEN, ICON_BUTTON } from '../../platform/ui/buttonStyles'
import { BackIcon, ForwardIcon, JoinIcon, NewIcon } from '../../platform/ui/icons'
import { Toast } from '../../platform/ui/Toast'
import { linkLabel } from '../../platform/ui/url'
import { useTimeZone } from '../auth/useMe'
import { PhoneHead } from '../layout/PhoneHead'
import { useEveryProject } from '../projects/api'
import { ProjectSquare } from '../projects/ProjectSquare'
import { useRegistry } from '../registry'
import { useInspector } from '../layout/inspectorAddress'
import { lunarWindowQuery } from './api'
import { useLunarName } from './lunarName'
import { dayParts, type Placed } from './dayParts'
import { lunarSquareName, monthRange, monthSquares, shiftMonth, WEEKDAYS } from './monthGrid'

/** A square's dots, one a kind, in this order, three at most (DES-001 "日历"). */
const DOTS = [
  { kind: 'occurrence', tone: 'bg-meeting' },
  { kind: 'due', tone: 'bg-warn' },
  { kind: 'follow-up', tone: 'bg-communication' },
  { kind: 'birthday', tone: 'bg-person' },
] as const

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Calls are named by their service, as a person says them; anything else by its host. */
const CALLS: [RegExp, string][] = [
  [/(^|\.)meet\.google\.com$/, 'Google Meet'],
  [/(^|\.)zoom\.us$/, 'Zoom'],
  [/(^|\.)teams\.microsoft\.com$/, 'Microsoft Teams'],
]
const callName = (url: string) => {
  const host = linkLabel(url).split('/')[0] ?? url
  return CALLS.find(([re]) => re.test(host))?.[1] ?? host
}

/**
 * THE CALENDAR ON A PHONE (FR-086, artboard 26): the month, Monday first, each day with its lunar
 * name (a month's first day by the month, a festival by its name) and a dot for each kind of thing
 * on it; today an ink circle, the chosen day shaded. Under it, the chosen day: its meetings, its
 * deadlines, its follow-ups and birthdays. The grid and the day scroll as one page.
 */
export function PhoneCalendar() {
  const timeZone = useTimeZone()
  const today = ymd(useNow(), timeZone)
  const [params, setParams] = useSearchParams()
  const asked = params.get('day')
  const chosen = asked && DAY.test(asked) ? asked : today
  const [cursor, setCursor] = useState(chosen)
  const [soon, setSoon] = useState(false)
  const registry = useRegistry()
  const range = monthRange(cursor)
  const lunar = useQuery({ ...lunarWindowQuery(range), placeholderData: keepPreviousData })
  const results = registry.calendar.map((p) => ({ moduleId: p.moduleId, ...p.useEntries(range) }))
  const byDay = new Map<string, Placed[]>()
  for (const { moduleId, entries } of results)
    for (const entry of entries) {
      const list = byDay.get(entry.day)
      if (list) list.push({ ...entry, moduleId })
      else byDay.set(entry.day, [{ ...entry, moduleId }])
    }
  const choose = (day: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('day', day)
        return next
      },
      { replace: true },
    )
  const squares = monthSquares(cursor)
  const [y, m] = cursor.split('-').map(Number) as [number, number]
  const title = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    ...(y === Number(today.slice(0, 4)) ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)))
  const parts = dayParts(byDay.get(chosen) ?? [])
  // The chosen day's lunar name in full, its month too (P4-05).
  const chosenLunar = useLunarName(chosen)

  return (
    <div className="flex flex-col gap-3">
      <PhoneHead
        title={title}
        actions={
          <>
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setCursor(shiftMonth(cursor, -1))}
              className={`${ICON_BUTTON} size-11`}
            >
              <BackIcon size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setCursor(shiftMonth(cursor, 1))}
              className={`${ICON_BUTTON} size-11`}
            >
              <ForwardIcon size={20} aria-hidden="true" />
            </button>
            {/* New event is a placeholder (FR-089, FR-101): it says so and opens nothing. */}
            <button
              type="button"
              aria-label="New event"
              onClick={() => setSoon(true)}
              className={`${ICON_BUTTON} size-11`}
            >
              <NewIcon size={22} aria-hidden="true" />
            </button>
          </>
        }
      />
      <div role="grid" aria-label={title} className="grid grid-cols-7">
        {WEEKDAYS.map((w) => (
          <span key={w} role="columnheader" className="pb-1 text-center text-meta text-subtle">
            {w}
          </span>
        ))}
        {squares.map(({ day, inMonth }) => {
          const name = lunarSquareName(lunar.data?.days[day], lunar.data?.festivals[day])
          const kinds = new Set((byDay.get(day) ?? []).map((e) => e.kind))
          const dots = DOTS.filter((d) => kinds.has(d.kind)).slice(0, 3)
          const isToday = day === today
          return (
            <button
              key={day}
              type="button"
              role="gridcell"
              data-day={day}
              aria-selected={day === chosen}
              aria-label={`${longDay(day)}${dots.length ? `, ${dots.length} kinds of things` : ''}`}
              onClick={() => choose(day)}
              className={`flex h-13 flex-col items-center justify-start gap-0.5 rounded-card pt-1 ${
                day === chosen && !isToday ? 'bg-hover' : ''
              } ${inMonth ? '' : 'opacity-40'}`}
            >
              <span
                className={`grid size-7 place-items-center rounded-full text-prose tabular-nums ${
                  isToday ? CHOSEN : 'text-ink'
                }`}
              >
                {Number(day.slice(8))}
              </span>
              <span
                className={`text-[10px] leading-3 ${name && name.is !== 'day' ? 'text-stop-t' : 'text-subtle'}`}
              >
                {name?.text ?? ''}
              </span>
              <span aria-hidden="true" className="flex h-1.5 gap-0.5">
                {dots.map((d) => (
                  <span key={d.kind} className={`size-1.5 rounded-full ${d.tone}`} />
                ))}
              </span>
            </button>
          )
        })}
      </div>

      <section aria-label={longDay(chosen)} className="flex flex-col gap-1.5">
        {/* In line with the card under it and the month's name above, at the page's 16. */}
        <h2 className="flex items-center gap-2 text-ui font-medium text-ink">
          {longDay(chosen)}
          {chosenLunar && <span className="font-normal text-muted">{chosenLunar}</span>}
        </h2>
        <DayList parts={parts} />
      </section>
      {soon && <Toast onGone={() => setSoon(false)}>Coming later</Toast>}
    </div>
  )
}

/** The chosen day's things, as a card of rows: a coloured edge for the kind, then what it is. */
function DayList({ parts }: { parts: ReturnType<typeof dayParts> }) {
  const projects = useEveryProject()
  const rows = [...parts.meetings, ...parts.due, ...parts.followUps, ...parts.birthdays]
  if (rows.length === 0) return <p className="text-prose text-muted">Nothing on this day.</p>
  return (
    <ul className="overflow-hidden rounded-phone-card border border-line bg-panel py-1">
      {rows.map((e) => {
        const project = e.projectId ? projects.data?.find((p) => p.id === e.projectId) : undefined
        const edge =
          e.kind === 'occurrence'
            ? 'bg-meeting'
            : e.kind === 'due'
              ? 'bg-warn'
              : e.kind === 'follow-up'
                ? 'bg-communication'
                : 'bg-person'
        return (
          <li key={e.key}>
            <Opens entry={e} className="flex min-h-14 items-center gap-3 px-3.5 py-2">
              <span aria-hidden="true" className={`w-1 self-stretch rounded-full ${edge}`} />
              <span className="flex w-12 shrink-0 flex-col font-mono text-ui">
                {e.kind === 'occurrence' ? (
                  <>
                    <span className="text-meeting-t">{e.time}</span>
                    {e.endTime && <span className="text-muted">{e.endTime}</span>}
                  </>
                ) : (
                  <span className="font-sans text-muted">
                    {e.kind === 'due' ? 'Due' : e.kind === 'follow-up' ? 'Follow up' : 'Birthday'}
                  </span>
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  className={`truncate text-prose ${e.done ? 'text-subtle line-through' : 'text-ink'}`}
                >
                  {e.title}
                </span>
                {e.kind === 'occurrence' && e.joinUrl && (
                  <span className="flex items-center gap-1.5 text-ui text-muted">
                    <JoinIcon size={14} aria-hidden="true" />
                    {callName(e.joinUrl)}
                  </span>
                )}
              </span>
              {project && <ProjectSquare project={project} />}
            </Opens>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Where a day's row goes: a meeting to its page, where Join is (FR-086); the rest into the sheet
 * over the page where their kind has a narrow page, else to their page.
 */
function Opens({
  entry: e,
  className,
  children,
}: {
  entry: Placed
  className: string
  children: ReactNode
}) {
  const registry = useRegistry()
  const show = useInspector().show
  const narrow = e.kind !== 'occurrence' && Boolean(registry.relationFor(e.type).Narrow)
  return (
    <Link
      to={e.to}
      data-day-entry={e.kind}
      className={className}
      onClick={(event) => {
        if (!narrow) return
        event.preventDefault()
        show({ type: e.type, id: e.id })
      }}
    >
      {children}
    </Link>
  )
}
