import type { ReviewResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listReview } from '../api/review'
import { EmptyState } from '../components/EmptyState'
import { Panel, PanelEmpty } from '../components/Panel'
import { Stat, StatRow } from '../components/Stat'
import { StatusMark } from '../components/StatusMark'
import { ViewTabs } from '../components/ViewTabs'
import { Completed } from './Completed'
import { MONTHS } from '../dueAt'
import { useProjectRail } from '../projectColor'

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
 * WHAT HAPPENED TO ONE TASK, as a row of the app's own shape.
 *
 * The three groups used to be three sub-headings with a grey count each -- "Done 2", "Start 1",
 * "Dropped 1" -- which is three labels to read before the first title. The mark says it instead:
 * the same glyph the task carries everywhere else in the app, so a finished task looks finished
 * here too and the list is one list.
 */
function Row({ title, status }: { title: string; status: 'done' | 'in_progress' | 'cancelled' }) {
  return (
    <li className="flex min-h-8 min-w-0 items-center gap-2 rounded-lg px-2 hover:bg-surface-hover">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        <StatusMark status={status} />
      </span>
      <span
        className={`min-w-0 truncate text-sm ${status === 'done' ? 'text-fg' : 'text-fg-muted'}`}
      >
        {title}
      </span>
    </li>
  )
}

const counted = (p: Project) => p.finished.length + p.started.length + p.dropped.length

/**
 * 我做了什么 -- the third of the spec's v1 views (§2), and the one the other two cannot answer.
 *
 * Done lists what is finished RIGHT NOW. This lists what HAPPENED in a window, read off the event
 * log: finished, started, dropped, grouped by line of work. A task finished on Tuesday and
 * reopened on Thursday is in neither place in Done and is in this one, which is the point.
 *
 * THE PAGE ANSWERS ONE QUESTION FIRST: how did the week go. That is three numbers, and until now
 * they were nowhere on it -- you counted rows. The banner carries them, the way the project page
 * and the workbench carry theirs, and everything under it is the detail behind them.
 *
 * The window is the server's: it decides the week boundary in the account's zone and reports the
 * bounds it used. The stepper moves by whole weeks from there.
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

  const projects = data?.projects ?? []
  const total = {
    done: projects.reduce((n, p) => n + p.finished.length, 0),
    started: projects.reduce((n, p) => n + p.started.length, 0),
    dropped: projects.reduce((n, p) => n + p.dropped.length, 0),
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 ref={heading} tabIndex={-1} className="text-xl font-semibold focus:outline-none">
          Review
        </h1>
        <ViewTabs views={VIEWS} current={view} onPick={pickView} />
        {/* THE WEEK, as one control. It used to be a date range printed as text with a lone
            "Last week" button pushed to the far right -- two halves of one idea, dressed as two
            unrelated things, and no way forward once you had gone back. */}
        {view === 'week' && data && (
          <div className="ml-auto flex items-center gap-1">
            <Step
              label="The week before"
              onClick={() => setRange(shiftWeek(data.from, data.to, -1))}
            >
              ‹
            </Step>
            <span className="min-w-[8.5rem] text-center text-sm tabular-nums text-fg-muted">
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
                className="ml-1 h-8 rounded-lg px-2.5 text-sm text-fg-muted hover:bg-surface-hover hover:text-fg"
              >
                This week
              </button>
            )}
          </div>
        )}
      </div>

      {view === 'done' && <Completed heading={false} />}

      {view === 'week' && review.isError && (
        <p role="alert" className="mt-4 text-sm text-danger">
          Couldn't load the review
        </p>
      )}

      {view === 'week' && data && (
        <>
          {/* HOW THE WEEK WENT, in the same shape the project page and the workbench use: one
              accent edge, and the numbers that say where things stand. */}
          <Panel label="The week" className="mt-4 border-l-4 border-l-accent">
            <div className="px-2 pb-1">
              <StatRow>
                <Stat label="Done" value={total.done} />
                <Stat label="Started" value={total.started} />
                <Stat label="Dropped" value={total.dropped} />
              </StatRow>
            </div>
          </Panel>

          {projects.length === 0 ? (
            <EmptyState title="Nothing happened this week" />
          ) : (
            /* TWO COLUMNS where there is room. A weekly review is a page of short lists, and one
               column of them left two thirds of a 1440 screen empty. */
            <div className="mt-4 grid min-w-0 items-start gap-4 xl:grid-cols-2">
              {projects.map((p) => (
                <Panel
                  key={p.projectId}
                  label={p.projectName}
                  count={counted(p)}
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
                  <ul className="flex flex-col">
                    {p.finished.map((t) => (
                      <Row key={t.id} title={t.title} status="done" />
                    ))}
                    {p.started.map((t) => (
                      <Row key={t.id} title={t.title} status="in_progress" />
                    ))}
                    {p.dropped.map((t) => (
                      <Row key={t.id} title={t.title} status="cancelled" />
                    ))}
                  </ul>
                  {counted(p) === 0 && <PanelEmpty>Nothing this week</PanelEmpty>}
                </Panel>
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
      className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-hover hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <span aria-hidden="true">{children}</span>
    </button>
  )
}
