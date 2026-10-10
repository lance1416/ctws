import type { CompletedTaskResponse } from '@ctws/contracts'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { listCompleted } from '../api/completed'
import { useTaskActions } from '../api/taskActions'
import { EmptyState } from '../components/EmptyState'
import { DONE_LIST_MEASURE, DONE_ROW_GRID, ProjectRail } from '../components/RowParts'
import { StatusButton } from '../components/StatusControls'
import { TaskDetail } from '../components/TaskDetail'
import { addDays, MONTHS, todayIn } from '../dueAt'
import { useTimeZone } from '../useMe'

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "Fri, Oct 2", with the year when it is not this year; the day is a calendar day, not an instant. */
function dayHeading(day: string, today: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const weekday = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  const date =
    today.slice(0, 4) === day.slice(0, 4) ? `${MONTHS[m - 1]} ${d}` : `${MONTHS[m - 1]} ${d}, ${y}`
  const near = day === today ? 'Today · ' : day === addDays(today, -1) ? 'Yesterday · ' : ''
  return `${near}${weekday}, ${date}`
}

/**
 * What I finished, newest first, across projects. The server decided the order and which day each
 * task belongs to (in the account timezone); this only partitions the list by that day.
 */
export function Completed({ heading: showHeading = true }: { heading?: boolean } = {}) {
  const completed = useQuery({ queryKey: ['completed'], queryFn: listCompleted })
  const [openId, setOpenId] = useState<string | null>(null)
  const qc = useQueryClient()
  const timezone = useTimeZone()
  const today = todayIn(timezone)
  const clock = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  })
  const heading = useRef<HTMLHeadingElement>(null)
  const actions = useTaskActions(() => {})

  const rows = completed.data?.tasks ?? []
  const openTask = rows.find((t) => t.id === openId)
  const days: { day: string; tasks: CompletedTaskResponse[] }[] = []
  for (const t of rows) {
    const last = days[days.length - 1]
    if (last && last.day === t.completedOn) last.tasks.push(t)
    else days.push({ day: t.completedOn, tasks: [t] })
  }

  return (
    <>
      {/* As a VIEW of Review this is an h2 and not an h1 -- that page's own heading is the h1, and
          two of them would tell a screen reader the page had two titles. It is still rendered,
          and still the thing focus lands on after a restore: a heading nobody can see is better
          than focus falling to <body>. */}
      {showHeading ? (
        <h1 ref={heading} tabIndex={-1} className="text-xl font-semibold focus:outline-none">
          Done
        </h1>
      ) : (
        <h2
          ref={heading as unknown as React.RefObject<HTMLHeadingElement>}
          tabIndex={-1}
          className="absolute h-px w-px overflow-hidden whitespace-nowrap focus:outline-none"
        >
          Done
        </h2>
      )}
      {completed.isPending && <p className="mt-6 text-fg-muted">Loading…</p>}
      {completed.isError && (
        <p role="alert" className="mt-6 text-danger">
          {completed.error instanceof Error
            ? completed.error.message
            : "Couldn't load. Check that the server is running."}
        </p>
      )}
      {completed.isSuccess && rows.length === 0 && <EmptyState title="Nothing finished yet" />}
      {days.map(({ day, tasks }) => (
        <section key={day} aria-label={dayHeading(day, today)} className="mt-8">
          <h2 className="text-sm font-semibold text-fg-muted">
            {dayHeading(day, today)} <span className="tabular-nums">{tasks.length}</span>
          </h2>
          <ul className={`mt-1 flex flex-col ${DONE_LIST_MEASURE}`}>
            {tasks.map((t) => (
              <li
                key={t.id}
                // The same row system as Today and the tree: the project rail at x=0, the marker,
                // the title, and one right-hand column. The clock lands at an identical x on
                // every row, which is what makes a day's list scannable rather than readable.
                className={`relative -mx-2 grid items-start gap-x-2 rounded-md py-1.5 pr-2 pl-3 ${DONE_ROW_GRID}`}
              >
                <ProjectRail projectId={t.projectId} />
                {/* Restoring is the one way back from a mis-click: a finished task has no other
                    way off this list, and there is deliberately no general undo. */}
                <span className="col-start-1 row-start-1 flex h-6 items-center">
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
                {/* THE ROW OPENS (D58). Until now a finished task could be restored from here
                    and nothing else -- not read, not corrected, not deleted -- so the only way
                    to look at one was to find it again in its project's tree. */}
                <button
                  type="button"
                  onClick={() => setOpenId(t.id)}
                  className="col-start-2 row-start-1 flex min-w-0 flex-col text-left"
                >
                  <span className="truncate">{t.title}</span>
                  <span className="truncate text-sm text-fg-muted">
                    {t.parentTitle === null ? t.projectName : `${t.projectName} › ${t.parentTitle}`}
                  </span>
                </button>
                <time
                  dateTime={t.completedAt ?? undefined}
                  className="col-start-3 row-start-1 flex h-6 items-center text-sm tabular-nums text-fg-muted"
                >
                  {t.completedAt ? clock.format(new Date(t.completedAt)) : ''}
                </time>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {/* THE SERVER SAYS WHETHER THIS IS ALL OF IT. Counting the rows against a 200 written on
          this side duplicates the server's limit and gets it wrong in both directions: it lies
          when exactly 200 tasks have ever been finished, and goes quiet if the server's cap ever
          changes. And it names where the rest is, because it is not lost -- Review takes any
          week and has no cap. */}
      {completed.data?.truncated && (
        <p className="mt-8 text-sm text-fg-muted">
          Showing the most recent {rows.length}. Older work is in Review, week by week.
        </p>
      )}
      {openTask && (
        <TaskDetail
          key={openTask.id}
          task={openTask}
          projectId={openTask.projectId}
          onClose={() => setOpenId(null)}
          // A save can take the row off this page (restoring it, say), so the list is refetched;
          // the pane itself stays open showing what was written, as it does everywhere else.
          onSaved={() => void qc.invalidateQueries({ queryKey: ['completed'] })}
        />
      )}
    </>
  )
}
