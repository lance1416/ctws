import { type ProjectResponse, type ProjectId } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { movementQuery } from '../api'
import { byRecency, isQuiet, movedOn } from '../logic/movement'
import { nearDay, shortDay, ymd } from '../../../platform/time/dates'
import { FlagIcon } from '../../../platform/ui/icons'
import { useNow } from '../../../platform/time/useNow'
import { useAccountToday, useTimeZone } from '../../../shell/auth'
import { StatusMark } from './StatusMark'

/** One project's movement: what is late, what is next, when it last moved. */
function useMoved(projectId: ProjectId) {
  const movement = useQuery(movementQuery(useAccountToday()))
  return movement.data?.find((m) => m.projectId === projectId)
}

/**
 * When a project last moved, beside its name on the overview's card (FR-051): "Moved Oct 20", or,
 * with open work and a week unchanged, an amber "Quiet for 9 days".
 */
export function ProjectMoved({ project: p }: { project: ProjectResponse }) {
  const m = useMoved(p.id)
  const today = ymd(useNow(), useTimeZone())
  if (!m) return null
  if (isQuiet(m))
    return (
      <span
        data-project-quiet
        className="inline-flex h-5.5 shrink-0 items-center rounded-control bg-warn-bg px-2 text-meta font-medium text-warn-t"
      >
        Quiet for {m.quietDays} days
      </span>
    )
  return (
    <span data-project-moved className="shrink-0 text-meta text-subtle">
      {movedOn(m, today)}
    </span>
  )
}

/**
 * A project's tasks on its card (FR-051, artboard 18): its progress, "19 of 31", then what is under
 * way, what is late and the next deadline, each in its own row.
 */
export function ProjectCardFacts({ project: p }: { project: ProjectResponse }) {
  const m = useMoved(p.id)
  const today = ymd(useNow(), useTimeZone())
  const done = m?.done ?? 0
  const counted = m?.counted ?? 0
  return (
    <>
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-line">
          <span
            className="bg-go"
            style={{ width: `${counted === 0 ? 0 : Math.round((done / counted) * 100)}%` }}
          />
        </span>
        <span data-project-progress className="shrink-0 text-meta text-subtle tabular-nums">
          {done} of {counted}
        </span>
      </div>
      <dl className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-x-2 text-ui">
        <Fact name="In progress" icon={<StatusMark status="in_progress" size={16} />}>
          <Count n={m?.inProgress ?? 0} />
        </Fact>
        <Fact name="Late" icon={<FlagIcon size={16} className="text-stop" />}>
          <Count n={m?.overdue ?? 0} tone="text-stop-t" />
        </Fact>
        <Fact name="Next due" icon={<FlagIcon size={16} className="text-muted" />}>
          {m?.nextDueOn ? (
            <span
              className={`font-mono text-meta ${m.nextDueOn === today ? 'text-warn-t' : 'text-ink'}`}
            >
              {nearDay(m.nextDueOn, today) ?? shortDay(m.nextDueOn, today)}
            </span>
          ) : (
            <span className="text-meta text-subtle">None</span>
          )}
        </Fact>
      </dl>
    </>
  )
}

function Fact({ name, icon, children }: { name: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div data-project-fact={name} className="contents">
      <span aria-hidden="true" className="flex min-h-5.5 items-center">
        {icon}
      </span>
      <dt className="text-muted">{name}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}

/** A count, grey when it is nothing; `tone` when it is something to act on. */
function Count({ n, tone = 'text-ink' }: { n: number; tone?: string }) {
  return <span className={`tabular-nums ${n === 0 ? 'text-subtle' : tone}`}>{n}</span>
}

/** The overview's order, the latest moved first and the quiet last (FR-051); a hook, once a page. */
export function useProjectOrder(): (a: ProjectResponse, b: ProjectResponse) => number {
  const movement = useQuery(movementQuery(useAccountToday()))
  return byRecency(movement.data ?? [])
}
