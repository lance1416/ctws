import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { weekdayDay, ymd } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { PanelEmpty } from '../../../platform/ui/Panel'
import { useAccountToday, useTimeZone } from '../../../shell/auth'
import { ProjectRail } from '../../../shell/rows'
import { completedQuery, todayQuery } from '../api'
import { revealHref } from '../logic/crumb'
import { taskPage } from '../logic/id'
import { todaySegments } from '../logic/today'
import { StatusMark } from './StatusMark'

/**
 * The workbench's glance at Today, not a second Today: three counts, each linking to where it is
 * dealt with, then what is in progress. No controls.
 */
export function TodayGlance() {
  const localToday = useAccountToday()
  const today = useQuery(todayQuery(localToday))
  // The same list Review's Done view and Today's Done section read.
  const completed = useQuery(completedQuery(localToday))

  if (today.isError) {
    return (
      <p role="alert" className="px-2 py-1.5 text-ui text-stop-t">
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
          tone={overdue > 0 ? 'text-stop-t' : 'text-subtle'}
        />
        <GlanceCount to={taskPage('today')} n={planned} word="planned" tone="text-ink" />
        <GlanceCount
          to={`${taskPage('review')}?view=done`}
          n={done}
          word="done"
          tone="text-subtle"
        />
      </div>
      <p className="mb-1 px-2 text-meta text-subtle">In progress</p>
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
                  <span className="max-w-[40%] shrink-0 truncate text-ui text-subtle">
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
      <span className="text-title tabular-nums">{n}</span> <span>{word}</span>
    </Link>
  )
}

/** The Today card's note: which day it is, in the account's zone. */
export function TodayDate() {
  const timeZone = useTimeZone()
  const now = useNow()
  const today = ymd(now, timeZone)
  return <span className="text-ui text-subtle">{weekdayDay(today, today)}</span>
}
