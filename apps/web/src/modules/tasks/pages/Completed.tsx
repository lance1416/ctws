import type { CompletedTaskResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { listCompleted } from '../api/completed'
import { useTaskActions } from '../api/taskActions'
import { DaySection } from '../../../shell/rows/DaySection'
import { EmptyState } from '../../../platform/ui/EmptyState'
import { DONE_LIST_MEASURE, ProjectRail } from '../../../shell/rows/RowParts'
import { RowLead } from '../../../shell/rows/RowLead'
import { StatusButton } from '../components/StatusControls'
import { TaskDetail } from '../components/TaskDetail'
import { addDays, MONTHS, todayIn } from '../../../platform/time/dates'
import { useTimeZone } from '../../../shell/auth/useMe'
import { useCrumbs } from '../../../shell/layout/Location'
import { useNow } from '../../../platform/time/useNow'

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
  useCrumbs(showHeading ? [{ label: 'Review', to: '/tasks/review' }, { label: 'Done' }] : null)
  const completed = useQuery({ queryKey: ['completed'], queryFn: listCompleted })
  const [openId, setOpenId] = useState<string | null>(null)
  const timezone = useTimeZone()
  const today = todayIn(timezone, useNow())
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
        <h1
          ref={heading}
          tabIndex={-1}
          // On the margin's edge, where the rows' threads hang: the page is one column of rows.
          className="ml-15 text-2xl font-semibold tracking-[-0.02em] focus:outline-none sm:ml-18"
        >
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
      {completed.isPending && <p className="mt-6 ml-15 text-ink-muted sm:ml-18">Loading…</p>}
      {completed.isError && (
        <p role="alert" className="mt-6 ml-15 text-danger sm:ml-18">
          {completed.error instanceof Error
            ? completed.error.message
            : "Couldn't load. Check that the server is running."}
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
                // The same anatomy as Today and the tree: when it was finished is the margin, so a
                // day's clocks end at one x and the list is scanned rather than read.
                className="flex items-stretch"
              >
                <RowLead
                  lead={
                    t.completedAt
                      ? { text: clock.format(new Date(t.completedAt)), tone: 'quiet', flag: false }
                      : null
                  }
                  dateTime={t.completedAt ?? undefined}
                />
                <ProjectRail projectId={t.projectId} />
                <span className="flex min-w-0 flex-1 items-start gap-2.5 pr-2 pl-3.5">
                  {/* Restoring is the one way back from a mis-click: a finished task has no other
                    way off this list, and there is deliberately no general undo. */}
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
                  {/* THE ROW OPENS. Until now a finished task could be restored from here
                    and nothing else -- not read, not corrected, not deleted -- so the only way
                    to look at one was to find it again in its project's tree. */}
                  <button
                    type="button"
                    onClick={() => setOpenId(t.id)}
                    className="flex min-w-0 flex-1 flex-col py-2.5 text-left"
                  >
                    <span className="truncate">{t.title}</span>
                    <span className="truncate text-sm text-ink-muted">
                      {t.parentTitle === null
                        ? t.projectName
                        : `${t.projectName} › ${t.parentTitle}`}
                    </span>
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </DaySection>
      ))}
      {/* THE SERVER SAYS WHETHER THIS IS ALL OF IT. Counting the rows against a 200 written on
          this side duplicates the server's limit and gets it wrong in both directions: it lies
          when exactly 200 tasks have ever been finished, and goes quiet if the server's cap ever
          changes. And it names where the rest is, because it is not lost -- Review takes any
          week and has no cap. */}
      {completed.data?.truncated && (
        <p className="mt-8 ml-15 text-sm text-ink-muted sm:ml-18">
          Showing the most recent {rows.length}. Older work is in Review, week by week.
        </p>
      )}
      {openTask && (
        <TaskDetail
          key={openTask.id}
          task={openTask}
          projectId={openTask.projectId}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  )
}
