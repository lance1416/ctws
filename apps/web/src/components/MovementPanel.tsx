import type { ProjectMovementResponse } from '@ctws/contracts'
import { Link } from 'react-router-dom'
import { hasMovement, stagnant, activityLabel } from '../movement'
import { projectRailClass } from '../projectColor'
import { Panel } from './Panel'

/**
 * 做到哪儿了: COUNTS AND MOVEMENT, NEVER A PERCENTAGE.
 *
 * There is deliberately no progress bar and no ratio on this panel, and that is a decision about
 * honesty rather than taste (workbench spec §5). Rollup is M3 work and nothing in the entire
 * codebase writes `manual_progress`, so a bar would be drawn against a column that is null for
 * every row in the database: a number the backend cannot cash. What a person can act on is what
 * MOVED -- how many finished this week, how many are left -- and what did NOT move.
 *
 * The stagnation line is the part that is hard to get from anywhere else. A project with open
 * work and no logged change for a week does not announce itself: it just quietly stops being
 * thought about. One sentence, naming one project, is enough; a list of them is a second backlog.
 */

/**
 * `rows` is every project the server reported; the panel decides which of them have a line worth
 * printing and which one, if any, has gone quiet. The page above owns the query so that it can
 * know whether this panel has anything to say before it decides to lay out a right-hand column
 * at all.
 */
export function MovementPanel({
  rows: all,
  today,
}: {
  rows: ProjectMovementResponse[]
  today: string
}) {
  const rows = all.filter(hasMovement)
  const quiet = stagnant(all)

  return (
    <Panel label="做到哪儿了">
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li key={r.projectId} className="min-w-0">
            <Link
              to={`/projects/${r.projectId}`}
              className="flex min-h-11 items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-hover"
            >
              {/* A chip, never a text colour and never alone: the project's NAME is right here
                  beside it (WCAG 1.4.1). Deliberately not the row system's `data-project-rail`,
                  because this is not a task row and must not be measured as one. */}
              <span
                aria-hidden="true"
                data-project-chip={r.projectId}
                className={`h-4 w-[3px] shrink-0 rounded-full ${projectRailClass(r.projectId)}`}
              />
              <span className="min-w-0 flex-1 truncate text-fg">{r.projectName}</span>
              {/* Two numbers, both of them things that can move. Tabular, so a column of
                  projects reads as a column of numbers. */}
              {/* Weight and value tell the two numbers apart, not hue: `plan`, `deadline` and
                  `missed` mean particular things about DATES, and spending one of them on a
                  count would make the palette say two things at once. */}
              <span className="shrink-0 text-sm font-semibold text-fg tabular-nums">
                本周 +{r.doneThisWeek}
              </span>
              <span className="shrink-0 text-sm text-fg-subtle tabular-nums">
                还剩 {r.remaining}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {quiet && (
        /* Set off by a PLANE, not by a hue: it is a sentence about silence, not a date
           semantic, and `deadline` / `missed` already mean particular things about dates. */
        <p
          data-stagnant={quiet.projectId}
          className="mt-2 rounded-lg bg-surface px-3 py-2 text-sm text-fg-muted"
        >
          <span className="font-semibold text-fg">{quiet.projectName}</span>最后一次活动是
          {activityLabel(quiet.lastActivityOn!, today)}，已经静了{' '}
          <span className="font-semibold text-fg tabular-nums">{quiet.quietDays}</span> 天。
        </p>
      )}
    </Panel>
  )
}
