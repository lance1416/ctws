import { useQuery } from '@tanstack/react-query'
import type { KeyboardEvent } from 'react'
import { monthDay } from '../../../platform/time/dates'
import { useAccountToday } from '../../../shell/auth'
import { reviewWeeksQuery } from '../api'
import { useReviewWeek } from '../hooks/useReviewWeek'
import { barShare, weeksByMonth } from '../logic/review'

const monthName = (month: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(
    new Date(`${month}-15T12:00:00Z`),
  )

/**
 * THE WEEKS (FR-081, artboard 19), in the sidebar beside Review: the recent weeks under their
 * months, each by its Monday with a bar of what it finished, every bar on one scale, the busiest
 * week full. This week says "so far".
 */
export function ReviewWeeks() {
  const today = useAccountToday()
  const weeks = useQuery(reviewWeeksQuery(today))
  const { monday, thisMonday, show } = useReviewWeek()
  if (!weeks.data) return null
  const order = weeks.data.map((w) => w.from)
  // A list like the others: ↑ and ↓ step to the newer and older week.
  const step = (e: KeyboardEvent, from: string) => {
    const by = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
    const to = order[order.indexOf(from) + by]
    if (!by || !to) return
    e.preventDefault()
    show(to)
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-review-week="${to}"]`)?.focus(),
    )
  }
  const most = Math.max(0, ...weeks.data.map((w) => w.finished))
  return (
    <nav aria-label="Weeks" className="flex min-h-0 flex-col overflow-y-auto pb-3">
      {weeksByMonth(weeks.data).map(({ month, weeks: inMonth }) => (
        <section key={month} aria-label={monthName(month)}>
          <h3 className="px-4 pt-2.5 pb-1 text-meta font-medium text-subtle">{monthName(month)}</h3>
          <ul className="flex flex-col">
            {inMonth.map((w) => {
              const on = w.from === monday
              return (
                <li key={w.from}>
                  <button
                    type="button"
                    data-review-week={w.from}
                    aria-current={on ? 'true' : undefined}
                    onClick={() => show(w.from)}
                    onKeyDown={(e) => step(e, w.from)}
                    className={`mx-1.5 grid min-h-9 w-[calc(100%-0.75rem)] max-lg:min-h-11 grid-cols-[minmax(0,1fr)_28px] items-center gap-x-2 rounded-control px-2.5 text-left text-ui text-ink ${
                      on ? 'bg-select' : 'hover:bg-hover'
                    }`}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className={`truncate ${on ? 'font-medium' : ''}`}>
                        {w.from === thisMonday ? `${monthDay(w.from)}, so far` : monthDay(w.from)}
                      </span>
                      <span
                        aria-hidden="true"
                        className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-line"
                      >
                        <span
                          className="bg-go"
                          style={{ width: `${barShare(w.finished, most)}%` }}
                        />
                      </span>
                    </span>
                    <span className="justify-self-end text-meta text-muted tabular-nums">
                      {w.finished}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </nav>
  )
}
