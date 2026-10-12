import type { ProjectMovementResponse } from '@ctws/contracts'
import { Link } from 'react-router-dom'
import { hasMovement, movedLine, QUIET_DAYS } from '../movement'
import { useProjectRail } from '../projectColor'

/**
 * THIS WEEK: where each line of work got to. COUNTS, NEVER A PERCENTAGE.
 *
 * There is deliberately no progress bar and no ratio here, and that is a decision about honesty
 * rather than taste: nothing in the codebase writes `manual_progress`, so a bar would be drawn
 * against a column that is null for every row. What a person can act on is what MOVED -- what got
 * done, and when the line last changed -- and what did NOT.
 *
 * A project that has gone quiet says so on its own line ("Quiet for 12 days"), its name a step
 * quieter, rather than in a sentence of its own: one line per project, and the silent one is
 * found where the reader is already looking.
 */
export function MovementPanel({
  rows: all,
  today,
}: {
  rows: ProjectMovementResponse[]
  today: string
}) {
  const rows = all.filter(hasMovement)
  const rail = useProjectRail()

  return (
    <aside aria-label="This week" data-panel="This week" className="min-w-0">
      <h2 className="mb-1.5 text-base font-semibold text-ink">This week</h2>
      <ul className="flex flex-col">
        {rows.map((r) => {
          const quiet = r.remaining > 0 && r.quietDays !== null && r.quietDays >= QUIET_DAYS
          return (
            <li key={r.projectId} className="min-w-0">
              <Link
                to={`/projects/${r.projectId}`}
                data-stagnant={quiet ? r.projectId : undefined}
                className="grid grid-cols-[3px_minmax(0,1fr)_auto] items-start gap-x-3 py-[7px] pr-1 hover:bg-hover"
              >
                {/* The project's strand, never alone: the NAME is right beside it (WCAG 1.4.1).
                    Not the row system's `data-project-rail`: this is not a task row and must not
                    be measured as one. */}
                <span
                  aria-hidden="true"
                  data-project-chip={r.projectId}
                  className={`self-stretch ${rail(r.projectId)}`}
                />
                <span className="flex min-w-0 flex-col">
                  <span className={`truncate ${quiet ? 'text-ink-muted' : 'text-ink'}`}>
                    {r.projectName}
                  </span>
                  <span className="text-sm text-ink-subtle">{movedLine(r, today)}</span>
                </span>
                <span className="text-sm whitespace-nowrap text-ink-subtle tabular-nums">
                  {r.remaining} open
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
