import type { ProjectMovementResponse } from '@ctws/contracts'
import { Link } from 'react-router-dom'
import { isQuiet, movedLine } from '../logic/movement'
import { useProjectRail } from '../../../shell/projects'

/**
 * Where each line of work got to this week, in counts, never a percentage: nothing stores the
 * progress a bar would need. A project gone quiet says so on its own line.
 */
export function MovementPanel({ rows, today }: { rows: ProjectMovementResponse[]; today: string }) {
  const rail = useProjectRail()

  return (
    <aside aria-label="This week" data-panel="This week" className="min-w-0">
      <h2 className="mb-1.5 text-prose font-medium text-ink">This week</h2>
      <ul className="flex flex-col">
        {rows.map((r) => {
          const quiet = isQuiet(r)
          return (
            <li key={r.projectId} className="min-w-0">
              <Link
                to={`/projects/${r.projectId}`}
                data-stagnant={quiet ? r.projectId : undefined}
                className="grid grid-cols-[3px_minmax(0,1fr)_auto] items-start gap-x-3 py-[7px] pr-1 hover:bg-hover"
              >
                {/* Not `data-project-rail`: this is not a task row and must not be measured as
                    one. The name beside it keeps the colour from being the only signal. */}
                <span
                  aria-hidden="true"
                  data-project-chip={r.projectId}
                  className={`self-stretch ${rail(r.projectId)}`}
                />
                <span className="flex min-w-0 flex-col">
                  <span className={`truncate ${quiet ? 'text-muted' : 'text-ink'}`}>
                    {r.projectName}
                  </span>
                  <span className="text-ui text-subtle">{movedLine(r, today)}</span>
                </span>
                <span className="text-ui whitespace-nowrap text-subtle tabular-nums">
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
