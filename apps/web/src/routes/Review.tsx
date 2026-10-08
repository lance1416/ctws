import type { ReviewResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listReview } from '../api/review'
import { EmptyState } from '../components/EmptyState'
import { Panel } from '../components/Panel'
import { ViewTabs } from '../components/ViewTabs'
import { Completed } from './Completed'
import { MONTHS } from '../dueAt'
import { useProjectRail } from '../projectColor'

/** "Oct 2" -- the month and the day; the window itself carries the year. */
function dayLabel(day: string): string {
  const [, m, d] = day.split('-').map(Number) as [number, number, number]
  return `${MONTHS[m - 1]} ${d}`
}

function shiftWeek(from: string, to: string): { from: string; to: string } {
  const back = (day: string) => {
    const d = new Date(`${day}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() - 7)
    return d.toISOString().slice(0, 10)
  }
  return { from: back(from), to: back(to) }
}

function Group({
  title,
  tasks,
}: {
  title: string
  tasks: ReviewResponse['projects'][number]['finished']
}) {
  if (tasks.length === 0) return null
  return (
    <div className="mt-2">
      <h4 className="text-sm text-fg-muted">
        {title} <span className="tabular-nums text-fg-subtle">{tasks.length}</span>
      </h4>
      <ul className="mt-0.5 flex flex-col">
        {tasks.map((t) => (
          <li key={t.id} className="min-h-7 py-0.5 text-fg">
            {t.title}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * 我做了什么 — the third of the spec's v1 views (§2), and the one the other two cannot answer.
 *
 * 已完成 lists what is finished RIGHT NOW. This lists what HAPPENED in a window, read off the
 * event log: finished, started, dropped, grouped by line of work. A task finished on Tuesday and
 * reopened on Thursday is in neither place in 已完成 and is in this one, which is the point.
 *
 * The window is the server's. It decides the week boundary in the account's zone and reports the
 * bounds it used; this page shows them and offers the one step back a weekly review needs.
 */
/**
 * 回顾 AND 已完成 ARE ONE DESTINATION.
 *
 * Both answer 「我做了什么」 -- one summarised by week off the event log, one as the flat list of
 * finished tasks by day. They were two rows in the rail because they were built a week apart, not
 * because they are two places. The view tabs are the shell's own mechanism, already carrying the
 * project blocks and the calendar; this is its third user.
 */
const VIEWS = [
  { id: 'week', label: 'This week' },
  { id: 'done', label: 'Done' },
]

export function Review() {
  const [params, setParams] = useSearchParams()
  const view = VIEWS.find((v) => v.id === params.get('view'))?.id ?? 'week'
  const pickView = (next: string) => {
    const copy = new URLSearchParams(params)
    if (next === 'week') copy.delete('view')
    else copy.set('view', next)
    setParams(copy, { replace: true })
  }
  const [range, setRange] = useState<{ from: string; to: string } | null>(null)
  const review = useQuery({
    queryKey: ['review', range?.from ?? 'week', range?.to ?? ''],
    queryFn: () => listReview(range ?? undefined),
    // The other view does not need it, and a request nobody reads is a request nobody should make.
    enabled: view === 'week',
  })
  const heading = useRef<HTMLHeadingElement>(null)
  const rail = useProjectRail()
  const data = review.data

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 ref={heading} tabIndex={-1} className="text-xl font-semibold focus:outline-none">
          Review
        </h1>
        <ViewTabs views={VIEWS} current={view} onPick={pickView} />
        {view === 'week' && data && (
          <p className="text-sm text-fg-muted">
            {dayLabel(data.from)} – {dayLabel(data.to)}
          </p>
        )}
        {view === 'week' && data && (
          <button
            type="button"
            onClick={() => setRange(range ? null : shiftWeek(data.from, data.to))}
            className="ml-auto h-8 rounded-lg px-2.5 text-sm text-fg-muted hover:bg-surface-hover hover:text-fg"
          >
            {range ? 'This week' : 'Last week'}
          </button>
        )}
      </div>

      {view === 'done' && <Completed heading={false} />}

      {view === 'week' && review.isError && (
        <p role="alert" className="mt-4 text-sm text-danger">
          Couldn't load the review
        </p>
      )}

      {view === 'week' && data && data.projects.length === 0 && (
        <EmptyState title="Nothing happened this week" />
      )}

      <div className="mt-4 flex max-w-[52rem] flex-col gap-3">
        {view === 'week' &&
          data?.projects.map((p) => (
            <Panel
              key={p.projectId}
              label={p.projectName}
              heading={
                <h2 className="flex min-w-0 items-center gap-2 text-lg font-semibold text-fg">
                  {/* A chip, never alone: the project's NAME is right beside it (WCAG 1.4.1). */}
                  <span
                    aria-hidden="true"
                    className={`h-4 w-[3px] shrink-0 rounded-full ${rail(p.projectId)}`}
                  />
                  <span className="truncate">{p.projectName}</span>
                </h2>
              }
            >
              <div className="px-2 pb-1">
                <Group title="Done" tasks={p.finished} />
                <Group title="Start" tasks={p.started} />
                <Group title="Dropped" tasks={p.dropped} />
              </div>
            </Panel>
          ))}
      </div>
    </>
  )
}
