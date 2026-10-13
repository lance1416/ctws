import type { ReviewResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listReview } from '../api/review'
import { DaySection } from '../components/DaySection'
import { EmptyState } from '../components/EmptyState'
import { RowLead } from '../components/RowLead'
import { BODY_GUTTER, ProjectRail, ROW_LIST } from '../components/RowParts'
import { StatusMark } from '../components/StatusMark'
import { ViewTabs } from '../components/ViewTabs'
import { Completed } from './Completed'
import { MONTHS, todayIn, ymd } from '../dueAt'
import { LIST_MEASURE, weekDayWord } from '../rowLead'
import { useTimeZone } from '../useMe'
import { useNow } from '../useNow'
import { useCrumbs } from '../components/Location'

/** "Oct 2" -- the month and the day; the window itself carries the year. */
function dayLabel(day: string): string {
  const [, m, d] = day.split('-').map(Number) as [number, number, number]
  return `${MONTHS[m - 1]} ${d}`
}

/** The same window, `weeks` away. Negative is backwards. */
function shiftWeek(from: string, to: string, weeks: number): { from: string; to: string } {
  const move = (day: string) => {
    const d = new Date(`${day}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + weeks * 7)
    return d.toISOString().slice(0, 10)
  }
  return { from: move(from), to: move(to) }
}

type Project = ReviewResponse['projects'][number]

/**
 * WHAT HAPPENED TO ONE TASK, on the app's row: the day it happened in the margin, the project's
 * thread, then the mark and the title.
 *
 * The three groups are told apart by the MARK, not by three sub-headings with a grey count each
 * -- "Done 2", "Start 1", "Dropped 1" is three labels to read before the first title. It is the
 * same glyph the task carries everywhere else, so a finished task looks finished here too and
 * the list is one list. The day is the ACCOUNT's (the event's instant in its zone), named as a
 * day of the week under review (`weekDayWord`).
 */
function Row({
  title,
  status,
  at,
  projectId,
  today,
  from,
  timeZone,
}: {
  title: string
  status: 'done' | 'in_progress' | 'cancelled'
  at: string
  projectId: string
  today: string
  /** The first day of the week under review. */
  from: string
  timeZone: string
}) {
  const text = weekDayWord(ymd(new Date(at), timeZone), today, from)
  return (
    <li data-review-row className="flex min-h-11 min-w-0">
      <RowLead lead={{ text, tone: 'quiet', flag: false }} dateTime={at} />
      <ProjectRail projectId={projectId} />
      <div
        className={`flex min-w-0 flex-1 items-start gap-2.5 py-2.5 pr-2 pl-[var(--gutter)] ${BODY_GUTTER}`}
      >
        <span className="flex h-6 shrink-0 items-center">
          <StatusMark status={status} />
        </span>
        <span className={`min-w-0 truncate ${status === 'done' ? 'text-ink' : 'text-ink-muted'}`}>
          {title}
        </span>
      </div>
    </li>
  )
}

/**
 * HOW THE WEEK WENT, IN ONE SENTENCE: "2 done, 1 started and 1 dropped." -- the way a project's
 * head says its numbers, not a row of tiles. A count of nothing is not news and is left out.
 */
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

const counted = (p: Project) => p.finished.length + p.started.length + p.dropped.length

/**
 * WHAT I DID -- the third of the v1 views, and the one the other two cannot answer.
 *
 * Done lists what is finished RIGHT NOW. This lists what HAPPENED in a window, read off the event
 * log: finished, started, dropped, grouped by line of work. A task finished on Tuesday and
 * reopened on Thursday is in neither place in Done and is in this one, which is the point.
 *
 * THE PAGE ANSWERS ONE QUESTION FIRST: how did the week go. That is three numbers, said as one
 * sentence under the title; everything under it is the detail behind them.
 *
 * The window is the server's: it decides the week boundary in the account's zone and reports the
 * bounds it used. The stepper moves by whole weeks from there.
 */
const VIEWS = [
  { id: 'week', label: 'This week' },
  { id: 'done', label: 'Done' },
]

export function Review() {
  useCrumbs([{ label: 'Review' }])
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
  const timeZone = useTimeZone()
  const today = todayIn(timeZone, useNow())
  const data = review.data

  const projects = data?.projects ?? []
  const total = {
    done: projects.reduce((n, p) => n + p.finished.length, 0),
    started: projects.reduce((n, p) => n + p.started.length, 0),
    dropped: projects.reduce((n, p) => n + p.dropped.length, 0),
  }

  return (
    <>
      {/* The title on the margin's edge, where the rows' threads and the sections' headings hang. */}
      <div className="ml-15 flex flex-wrap items-center gap-x-3 gap-y-2 sm:ml-18">
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-2xl font-semibold tracking-[-0.02em] focus:outline-none"
        >
          Review
        </h1>
        <ViewTabs views={VIEWS} current={view} onPick={pickView} />
        {/* THE WEEK, as one control. It used to be a date range printed as text with a lone
            "Last week" button pushed to the far right -- two halves of one idea, dressed as two
            unrelated things, and no way forward once you had gone back. */}
        {view === 'week' && data && (
          // Its own line when the title row has no room (a phone): it wraps, never overflows.
          <div className="ml-auto flex flex-wrap items-center gap-1">
            <Step
              label="The week before"
              onClick={() => setRange(shiftWeek(data.from, data.to, -1))}
            >
              ‹
            </Step>
            <span className="text-center text-sm whitespace-nowrap text-ink-muted tabular-nums">
              {dayLabel(data.from)} – {dayLabel(data.to)}
            </span>
            {/* FORWARD STOPS AT THIS WEEK. Next week has not happened, so the only thing the
                step could produce is an empty page -- a control whose one outcome is nothing. */}
            <Step
              label="The week after"
              disabled={range === null}
              onClick={() => setRange(shiftWeek(data.from, data.to, 1))}
            >
              ›
            </Step>
            {range && (
              <button
                type="button"
                onClick={() => setRange(null)}
                className="ml-1 h-8 rounded-md px-2.5 text-sm whitespace-nowrap text-ink-muted hover:bg-hover hover:text-ink"
              >
                This week
              </button>
            )}
          </div>
        )}
      </div>

      {view === 'done' && <Completed heading={false} />}

      {view === 'week' && review.isError && (
        <p role="alert" className="mt-4 ml-15 text-sm text-danger sm:ml-18">
          Couldn't load the review
        </p>
      )}

      {view === 'week' && data && (
        <>
          {weekSentence(total) && (
            <p data-review-sentence className="mt-1.5 ml-15 text-ink-muted tabular-nums sm:ml-18">
              {weekSentence(total)}
            </p>
          )}

          {projects.length === 0 ? (
            <EmptyState hang title="Nothing happened this week" />
          ) : (
            /* ONE COLUMN, a section per line of work, like every other list in the app: the
               threads at one x, and the day each thing happened in the margin. */
            <div className={`mt-8 flex flex-col gap-8 ${LIST_MEASURE}`}>
              {projects.map((p) => (
                <DaySection key={p.projectId} label={p.projectName} count={counted(p)}>
                  <ul className={ROW_LIST}>
                    {p.finished.map((t) => (
                      <Row
                        key={t.id}
                        title={t.title}
                        status="done"
                        at={t.at}
                        projectId={p.projectId}
                        today={today}
                        from={data.from}
                        timeZone={timeZone}
                      />
                    ))}
                    {p.started.map((t) => (
                      <Row
                        key={t.id}
                        title={t.title}
                        status="in_progress"
                        at={t.at}
                        projectId={p.projectId}
                        today={today}
                        from={data.from}
                        timeZone={timeZone}
                      />
                    ))}
                    {p.dropped.map((t) => (
                      <Row
                        key={t.id}
                        title={t.title}
                        status="cancelled"
                        at={t.at}
                        projectId={p.projectId}
                        today={today}
                        from={data.from}
                        timeZone={timeZone}
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
      className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-hover hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <span aria-hidden="true">{children}</span>
    </button>
  )
}
