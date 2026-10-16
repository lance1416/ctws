import { taskCrumb } from '../crumb'
import type { CompletedTaskResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { completedQuery } from '../api/queries'
import { useTaskActions } from '../api/taskActions'
import { DaySection } from '../../../shell/rows/DaySection'
import { EmptyState } from '../../../platform/ui/EmptyState'
import { ProjectRail } from '../../../shell/rows/RowParts'
import { DONE_LIST_MEASURE } from '../components/TaskRowParts'
import { RowLead } from '../../../shell/rows/RowLead'
import { StatusButton } from '../components/StatusControls'
import { TaskDetail } from '../components/TaskDetail'
import { useFocusAfterRemoval } from '../components/useFocusAfterRemoval'
import { addDays } from '@ctws/core/day'
import { clockTime } from '@ctws/core/clock'
import { MONTHS, weekdayOf, ymd } from '../../../platform/time/dates'
import { useTimeZone } from '../../../shell/auth/useMe'
import { useNow } from '../../../platform/time/useNow'
import { QueryStatus } from '../../../platform/ui/QueryStatus'
import { HANG } from '../../../platform/ui/hang'

/** "Fri, Oct 2", with the year when not this year. `day` is a calendar day, not an instant. */
function dayHeading(day: string, today: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const weekday = weekdayOf(day, true)
  const date =
    today.slice(0, 4) === day.slice(0, 4) ? `${MONTHS[m - 1]} ${d}` : `${MONTHS[m - 1]} ${d}, ${y}`
  const near = day === today ? 'Today · ' : day === addDays(today, -1) ? 'Yesterday · ' : ''
  return `${near}${weekday}, ${date}`
}

/** Review's Done view, newest first. The server decides each task's day; this only groups by it. */
export function Completed() {
  const completed = useQuery(completedQuery())
  const [openId, setOpenId] = useState<string | null>(null)
  const timezone = useTimeZone()
  const today = ymd(useNow(), timezone)
  const heading = useRef<HTMLHeadingElement>(null)
  const [error, setError] = useState<string | null>(null)
  const actions = useTaskActions(setError)
  // An open pane can delete its task or bring it back to work: either way its row leaves.
  useFocusAfterRemoval({
    ids: () =>
      [...document.querySelectorAll<HTMLElement>('[data-done-row]')].map(
        (el) => el.dataset.doneRow!,
      ),
    rowFor: (id) => document.querySelector<HTMLElement>(`[data-done-row="${id}"]`),
    heading: () => heading.current,
    open: openId,
  })

  const rows = completed.data?.tasks ?? []
  const openTask = rows.find((t) => t.id === openId)
  // A pane whose task has left this list (deleted, brought back to work) closes itself.
  useEffect(() => {
    if (openId && completed.isSuccess && !openTask) setOpenId(null)
  }, [openId, openTask, completed.isSuccess])
  const days: { day: string; tasks: CompletedTaskResponse[] }[] = []
  for (const t of rows) {
    const last = days[days.length - 1]
    if (last && last.day === t.completedOn) last.tasks.push(t)
    else days.push({ day: t.completedOn, tasks: [t] })
  }

  return (
    <>
      {/* Unseen, but where focus lands after a restore rather than falling to <body>. */}
      <h2
        ref={heading}
        tabIndex={-1}
        className="absolute h-px w-px overflow-hidden whitespace-nowrap focus:outline-none"
      >
        Done
      </h2>
      <QueryStatus query={completed} />
      {error && (
        <p role="alert" className={`mb-3 ${HANG} text-sm text-danger`}>
          {error}
        </p>
      )}
      {completed.isSuccess && rows.length === 0 && <EmptyState hang title="Nothing finished yet" />}
      {days.map(({ day, tasks }) => (
        <DaySection
          key={day}
          label={dayHeading(day, today)}
          count={tasks.length}
          className={`mt-8 ${DONE_LIST_MEASURE}`}
        >
          <ul className="flex flex-col">
            {tasks.map((t) => (
              <li
                key={t.id}
                // When it was finished is the margin, so a day's clocks end at one x.
                className="flex items-stretch"
              >
                <RowLead
                  lead={{
                    text: clockTime(new Date(t.completedAt), timezone),
                    tone: 'quiet',
                    flag: false,
                  }}
                  dateTime={t.completedAt}
                />
                <ProjectRail projectId={t.projectId} />
                <span className="flex min-w-0 flex-1 items-start gap-2.5 pr-2 pl-3.5">
                  {/* Restoring is the way back from a mis-click: there is no general undo. */}
                  <span className="flex h-11 shrink-0 items-center">
                    <StatusButton
                      status={t.status}
                      title={t.title}
                      onClick={() =>
                        actions.setStatus(t.id, 'backlog', () =>
                          // The row leaves with the refetch; keep focus on the page, not <body>.
                          setTimeout(() => heading.current?.focus(), 0),
                        )
                      }
                    />
                  </span>
                  <button
                    type="button"
                    data-done-row={t.id}
                    onClick={() => setOpenId(t.id)}
                    className="flex min-w-0 flex-1 flex-col py-2.5 text-left"
                  >
                    <span className="truncate">{t.title}</span>
                    <span className="truncate text-sm text-ink-muted">{taskCrumb(t)}</span>
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </DaySection>
      ))}
      {/* The server says whether this is all of it, so no cap is counted here. */}
      {completed.data?.truncated && (
        <p className={`mt-8 ${HANG} text-sm text-ink-muted`}>
          Showing the most recent {rows.length}. Older work is in Review, week by week.
        </p>
      )}
      {openTask && <TaskDetail key={openTask.id} task={openTask} onClose={() => setOpenId(null)} />}
    </>
  )
}
