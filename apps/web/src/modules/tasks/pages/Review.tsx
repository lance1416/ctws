import { REVIEW_TRANSITIONS, type ReviewList, type ProjectId } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { reviewQuery } from '../api'
import {
  DaySection,
  LIST_MEASURE,
  ProjectRail,
  ROW_BODY,
  ROW_LIST,
  RowLead,
  weekDayWord,
} from '../../../shell/rows'
import { EmptyState } from '../../../platform/ui/EmptyState'
import { StatusMark } from '../components/StatusMark'
import { useViewParam, ViewTabs } from '../../../platform/ui/ViewTabs'
import { Completed } from './Completed'
import { addDays } from '@ctws/core/day'
import { monthDay, nextMonday, ymd } from '../../../platform/time/dates'
import { reviewRows, weekAfter, weekBefore } from '../logic/review'
import { useTimeZone } from '../../../shell/auth'
import { useNow } from '../../../platform/time/useNow'
import { PageHead } from '../../../platform/ui/PageHead'
import { HANG } from '../../../platform/ui/hang'

/**
 * What happened to one task: its day in the margin, the project's thread, the mark and the title.
 * The mark, not a sub-heading, tells done, started and dropped apart.
 */
function Row({
  title,
  status,
  at,
  projectId,
  today,
  from,
}: {
  title: string
  status: (typeof REVIEW_TRANSITIONS)[ReviewList]
  at: string
  projectId: ProjectId
  today: string
  /** The first day of the week under review. */
  from: string
}) {
  const timeZone = useTimeZone()
  const text = weekDayWord(ymd(new Date(at), timeZone), today, from)
  return (
    <li data-review-row className="flex min-h-11 min-w-0">
      <RowLead lead={{ text, tone: 'quiet', flag: false }} dateTime={at} />
      <ProjectRail projectId={projectId} />
      <div className={`${ROW_BODY} items-start gap-2.5 py-2.5 pr-2`}>
        <span className="flex h-6 shrink-0 items-center">
          <StatusMark status={status} />
        </span>
        <span className={`min-w-0 truncate ${status === 'done' ? 'text-ink' : 'text-muted'}`}>
          {title}
        </span>
      </div>
    </li>
  )
}

/** "2 done, 1 started and 1 dropped.", leaving out a count of nothing. */
function weekSentence(total: { done: number; started: number; dropped: number }): string | null {
  const parts = [
    total.done > 0 ? `${total.done} done` : null,
    total.started > 0 ? `${total.started} started` : null,
    total.dropped > 0 ? `${total.dropped} dropped` : null,
  ].filter((p): p is string => p !== null)
  if (parts.length === 0) return null
  const last = parts.pop()!
  return `${parts.length > 0 ? `${parts.join(', ')} and ` : ''}${last}.`
}

// Done lists what is finished now; the week view lists what happened in a window, off the event
// log, so a task finished on Tuesday and reopened on Thursday shows only here.
const VIEWS = [
  { id: 'week', label: 'This week' },
  { id: 'done', label: 'Done' },
]

export function Review() {
  const [view, pickView] = useViewParam(VIEWS)
  const [range, setRange] = useState<{ from: string; to: string } | null>(null)
  const review = useQuery({
    ...reviewQuery(range),
    // Only the week view reads it.
    enabled: view === 'week',
  })
  const timeZone = useTimeZone()
  const today = ymd(useNow(), timeZone)
  // The Monday this week began on, in the account's calendar -- the server's week too.
  const thisMonday = addDays(nextMonday(today), -7)
  const data = review.data

  const projects = data?.projects ?? []
  const total = {
    done: projects.reduce((n, p) => n + p.finished.length, 0),
    started: projects.reduce((n, p) => n + p.started.length, 0),
    dropped: projects.reduce((n, p) => n + p.dropped.length, 0),
  }

  return (
    <>
      {/* The title on the margin's edge, where the rows' threads and headings hang. */}
      <div className={`${HANG} flex flex-wrap items-center gap-x-3 gap-y-2`}>
        <PageHead>Review</PageHead>
        <ViewTabs views={VIEWS} current={view} onPick={pickView} />
        {/* The week as one control: back, the window, forward. */}
        {view === 'week' && data && (
          // Its own line when the title row has no room (a phone): it wraps, never overflows.
          <div className="ml-auto flex flex-wrap items-center gap-1">
            <Step label="The week before" onClick={() => setRange(weekBefore(data.from))}>
              ‹
            </Step>
            <span className="text-center text-ui whitespace-nowrap text-muted tabular-nums">
              {monthDay(data.from)} – {monthDay(data.to)}
            </span>
            {/* Forward stops at this week: next week has not happened. */}
            <Step
              label="The week after"
              disabled={range === null}
              onClick={() => setRange(weekAfter(data.from, thisMonday))}
            >
              ›
            </Step>
            {range && (
              <button
                type="button"
                onClick={() => setRange(null)}
                className="ml-1 h-8 rounded-control px-2.5 text-ui whitespace-nowrap text-muted hover:bg-hover hover:text-ink"
              >
                This week
              </button>
            )}
          </div>
        )}
      </div>

      {view === 'done' && <Completed />}

      {view === 'week' && review.isError && (
        <p role="alert" className={`mt-4 ${HANG} text-ui text-stop-t`}>
          Couldn't load the review
        </p>
      )}

      {view === 'week' && data && (
        <>
          {weekSentence(total) && (
            <p data-review-sentence className={`mt-1.5 ${HANG} text-muted tabular-nums`}>
              {weekSentence(total)}
            </p>
          )}

          {projects.length === 0 ? (
            <EmptyState hang title="Nothing happened this week" />
          ) : (
            /* A section per line of work, the threads at one x. */
            <div className={`mt-8 flex flex-col gap-8 ${LIST_MEASURE}`}>
              {projects.map((p) => (
                <DaySection key={p.projectId} label={p.projectName} count={reviewRows(p).length}>
                  <ul className={ROW_LIST}>
                    {reviewRows(p).map(({ key, list, task: t }) => (
                      <Row
                        key={key}
                        title={t.title}
                        status={REVIEW_TRANSITIONS[list]}
                        at={t.at}
                        projectId={p.projectId}
                        today={today}
                        from={data.from}
                      />
                    ))}
                  </ul>
                </DaySection>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}

/** One step of the week stepper. A glyph needs a name; the arrow itself is not one. */
function Step({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-control text-muted hover:bg-hover hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <span aria-hidden="true">{children}</span>
    </button>
  )
}
