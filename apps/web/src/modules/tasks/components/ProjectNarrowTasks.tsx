import type { ProjectId } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { StageLabel } from '../../../platform/ui/StageLabel'
import { StatusMark } from '../../../platform/ui/StatusMark'
import { NarrowRow } from '../../../shell/inspector'
import { useEveryProject } from '../../../shell/projects'
import { projectTasksQuery } from '../api'
import { ProgressSquare } from './ProgressSquare'
import { revealHref } from '../logic/crumb'
import { leafCounts } from '../logic/tree/leafCounts'
import { isFinished } from '../logic/status'

/** Top-level rows before the way to the whole tree (FR-011). */
const SHOWN = 5

/**
 * A project's tasks on its narrow page (artboard 33): how many are open, the top level only, each
 * with its stage, then "The whole tree" on the project's page.
 */
export function ProjectNarrowTasks({ projectId }: { projectId: ProjectId }) {
  const tasks = useQuery(projectTasksQuery(projectId)).data?.tasks ?? []
  const top = tasks.filter((t) => t.parentId === null && !isFinished(t.status))
  const open = tasks.filter((t) => !isFinished(t.status)).length
  // A parent shows its progress, a leaf its status (I-04, DES-001 "进度方块").
  const counts = leafCounts(tasks)
  const project = useEveryProject().data?.find((p) => p.id === projectId)
  const stageOf = (id: string | null) => project?.stages.find((s) => s.id === id)?.name
  return (
    <section aria-label="Tasks" className="flex flex-col gap-1.5 border-t border-line px-4 py-3">
      <h3 className="flex items-center gap-2 text-ui font-medium text-ink">
        Tasks
        <span className="text-meta font-normal text-muted tabular-nums">{open} open</span>
      </h3>
      {top.length === 0 ? (
        <p className="text-meta text-subtle">Nothing open</p>
      ) : (
        <ul className="flex flex-col">
          {top.slice(0, SHOWN).map((t) => (
            <NarrowRow
              key={t.id}
              mark={
                counts.has(t.id) ? (
                  <ProgressSquare status={t.status} children={counts.get(t.id)!} />
                ) : (
                  <StatusMark status={t.status} size={14} />
                )
              }
              thing={{ type: 'task', id: t.id }}
              to={revealHref(projectId, t.id)}
              title={t.title}
              fact={stageOf(t.stageId) && <StageLabel name={stageOf(t.stageId)!} quiet={false} />}
            />
          ))}
        </ul>
      )}
      <Link to={`/projects/${projectId}`} className="pl-7 text-meta text-muted hover:text-ink">
        The whole tree
      </Link>
    </section>
  )
}
