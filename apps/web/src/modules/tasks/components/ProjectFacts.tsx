import { type ProjectResponse, type ProjectId } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { Fragment, type ReactNode } from 'react'
import { movementQuery } from '../api'
import { movedLine } from '../logic/movement'
import { openTasksOf } from '../logic/openTasks'
import { shortDay, ymd } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { useAccountToday, useTimeZone } from '../../../shell/auth'
import { deadlineDayLead, RowLead } from '../../../shell/rows'

/** One project's movement: what is late, what is next, when it last moved. */
function useMoved(projectId: ProjectId) {
  const movement = useQuery(movementQuery(useAccountToday()))
  return movement.data?.find((m) => m.projectId === projectId)
}

/** A project's tasks in numbers on its Workbench card, a line each. The open count is the server's. */
export function ProjectTileFacts({ project: p }: { project: ProjectResponse }) {
  const m = useMoved(p.id)
  const today = ymd(useNow(), useTimeZone())
  return (
    <>
      <span className="text-ink-muted tabular-nums">{openTasksOf(p)} open</span>
      {m && m.overdue > 0 ? (
        <span className="text-missed">{m.overdue} overdue</span>
      ) : m?.nextDueOn ? (
        <span className="text-deadline">Due {shortDay(m.nextDueOn, today)}</span>
      ) : null}
      {m && <span className="text-ink-subtle">{movedLine(m, today)}</span>}
    </>
  )
}

/** A project's tasks in numbers on its row in the list, as one line. */
export function ProjectRowFacts({ project: p }: { project: ProjectResponse }) {
  const m = useMoved(p.id)
  const today = ymd(useNow(), useTimeZone())
  const said: ReactNode[] = [
    <span key="open" data-count>
      {openTasksOf(p)} open
    </span>,
  ]
  // "0 overdue" is not news.
  if (m && m.overdue > 0)
    said.push(
      <span key="late" className="text-missed">
        {m.overdue} overdue
      </span>,
    )
  if (m) said.push(<span key="moved">{movedLine(m, today)}</span>)
  return said.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && <span aria-hidden="true"> · </span>}
      {part}
    </Fragment>
  ))
}

/** The project's next standing deadline, in the margin of its row. */
export function ProjectLead({ projectId }: { projectId: ProjectId }) {
  const m = useMoved(projectId)
  const today = ymd(useNow(), useTimeZone())
  return <RowLead lead={m?.nextDueOn ? deadlineDayLead(m.nextDueOn, today) : null} />
}
