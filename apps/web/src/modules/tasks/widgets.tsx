import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ymd } from '../../platform/time/dates'
import { useNow } from '../../platform/time/useNow'
import { PanelEmpty } from '../../platform/ui/Panel'
import { useTimeZone } from '../../shell/auth'
import { useProjects } from '../../shell/projects'
import { ProjectRail } from '../../shell/rows'
import { completedQuery, todayQuery } from './api/queries'
import { StatusMark } from './components/StatusMark'
import { revealHref } from './crumb'
import { taskPage } from './id'
import { todaySegments } from './today'

/** The rail's count for Today. */
export function TodayCount() {
  const today = useQuery(todayQuery())
  const count = today.data?.length ?? null
  if (count === null || count <= 0) return null
  return (
    <span data-count className="ml-auto pl-1 text-xs text-ink-muted">
      {count}
    </span>
  )
}

/** Things' count for tasks: how many are open across every line of work, zero included. */
export function OpenTaskCount() {
  const projects = useProjects()
  if (!projects.data) return null
  const open = projects.data.reduce((n, p) => n + p.openTasks, 0)
  return <span data-count>{open} open</span>
}

/** What is pressing among them, from Today's own list: what is late and what is planned. */
export function TaskStatusLine() {
  const today = useQuery(todayQuery())
  const { overdue, planned } = todaySegments(today.data ?? [])
  const late = overdue.length
  const parts = [
    late > 0 && `${late} overdue`,
    planned.length > 0 && `${planned.length} planned for today`,
  ]
  const line = parts.filter(Boolean).join(', ')
  return line ? <span data-status>{line}</span> : null
}

/**
 * The workbench's glance at Today, not a second Today: three counts, each linking to where it is
 * dealt with, then what is in progress. No controls.
 */
export function TodayGlance() {
  const today = useQuery(todayQuery())
  // The same list Review's Done view and Today's Done section read.
  const completed = useQuery(completedQuery())
  const localToday = ymd(useNow(), useTimeZone())

  if (today.isError) {
    return (
      <p role="alert" className="px-2 py-1.5 text-sm text-danger">
        Couldn't load today's tasks
      </p>
    )
  }
  const rows = today.data ?? []
  const segments = todaySegments(rows)
  const overdue = segments.overdue.length
  const planned = segments.planned.length
  const done = (completed.data?.tasks ?? []).filter((t) => t.completedOn === localToday).length
  const doing = rows.filter((t) => t.status === 'in_progress')
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1">
        {/* Late takes the miss colour, only when there is any. */}
        <GlanceCount
          to={taskPage('today')}
          n={overdue}
          word="overdue"
          tone={overdue > 0 ? 'text-missed' : 'text-ink-subtle'}
        />
        <GlanceCount to={taskPage('today')} n={planned} word="planned" tone="text-ink" />
        <GlanceCount
          to={`${taskPage('review')}?view=done`}
          n={done}
          word="done"
          tone="text-ink-subtle"
        />
      </div>
      <p className="mb-1 px-2 text-xs text-ink-subtle">In progress</p>
      {today.isSuccess && doing.length === 0 ? (
        <PanelEmpty>Nothing in progress</PanelEmpty>
      ) : (
        <ul className="min-w-0">
          {doing.map((t) => (
            <li key={t.id}>
              <Link
                to={revealHref(t.projectId, t.id)}
                className="flex min-h-10 min-w-0 items-stretch gap-3 hover:bg-hover"
              >
                <ProjectRail projectId={t.projectId} />
                <span className="flex shrink-0 items-center">
                  <StatusMark status={t.status} />
                </span>
                <span className="flex min-w-0 items-baseline gap-2 self-center">
                  <span className="truncate text-ink">{t.title}</span>
                  {/* The name beside the rail, so the colour is never the only signal. */}
                  <span className="max-w-[40%] shrink-0 truncate text-sm text-ink-subtle">
                    {t.projectName}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** One count: the number large, its word beside it, the whole of it the way there. */
function GlanceCount({ to, n, word, tone }: { to: string; n: number; word: string; tone: string }) {
  return (
    <Link to={to} className={`flex items-baseline gap-2 px-2 py-0.5 hover:bg-hover ${tone}`}>
      <span className="text-xl font-medium tabular-nums">{n}</span> <span>{word}</span>
    </Link>
  )
}

/** The Today card's note: which day it is, in the account's zone. */
export function TodayDate() {
  const timeZone = useTimeZone()
  const now = useNow()
  return (
    <span className="text-sm text-ink-subtle">
      {new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone,
      }).format(now)}
    </span>
  )
}
