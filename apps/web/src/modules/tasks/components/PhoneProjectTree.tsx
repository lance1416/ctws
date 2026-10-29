import type { ProjectId, TaskId } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useContext, useState } from 'react'
import { ymd } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { BlockFailed, SkeletonRows } from '../../../platform/ui/Block'
import { FlagIcon, NewIcon } from '../../../platform/ui/icons'
import { StageLabel } from '../../../platform/ui/StageLabel'
import { StatusMark } from '../../../platform/ui/StatusMark'
import { useTimeZone } from '../../../shell/auth'
import { NewContext } from '../../../shell/creates'
import { useShowInInspector } from '../../../shell/inspector'
import { useEveryProject } from '../../../shell/projects'
import { useRegistry } from '../../../shell/registry'
import { projectTasksQuery } from '../api'
import { useTaskActions } from '../hooks/useTaskActions'
import { isFinished } from '../logic/status'
import { flatten } from '../logic/tree/flatten'
import { leafCounts } from '../logic/tree/leafCounts'
import { treeDue } from '../logic/tree/treeDue'
import { EditStages } from './board/EditStages'
import { ProgressSquare } from './ProgressSquare'
import { useTreeVisibility } from './tree/useTreeVisibility'

/** Each level in, as far as the fourth; deeper rows say so with "…" before the name. */
const LEVEL_PX = 16
const DEEPEST = 4

const DUE_TONE: Record<string, string> = {
  late: 'bg-stop-bg text-stop-t',
  quiet: 'bg-hover text-muted',
  waiting: 'bg-hover text-muted',
}

/**
 * A PROJECT'S TREE ON A PHONE (FR-088, DES-001 "项目页"): no board and no dragging. A row a task,
 * 44 and over, in from the left 16 a level up to the fourth; what the desk's columns say (its
 * stage, its deadline, "1/4") as tags on a second line, none where there is nothing. The circle
 * finishes a leaf; its name opens it in the sheet. Moving it elsewhere is its Move to….
 */
export function PhoneProjectTree({ projectId }: { projectId: ProjectId }) {
  const tasks = useQuery(projectTasksQuery(projectId))
  const all = tasks.data?.tasks ?? []
  const shown = useTreeVisibility(projectId, all)
  const [error, setError] = useState<string | null>(null)
  const actions = useTaskActions(setError)
  const inspect = useShowInInspector()
  const timeZone = useTimeZone()
  const today = ymd(useNow(), timeZone)
  const openNew = useContext(NewContext)
  const creator = useRegistry().creates.find((c) => c.kind === 'task')
  if (tasks.isError) return <BlockFailed what="tasks" onRetry={() => void tasks.refetch()} />
  if (tasks.isPending) return <SkeletonRows rows={4} />
  const byId = new Map(all.map((t) => [t.id, t]))
  const counts = leafCounts(all)
  const stages = new Map((tasks.data?.stages ?? []).map((s) => [s.id, s]))
  const rows = flatten(shown.visible, new Set<TaskId>())
  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p role="alert" className="text-ui text-stop-t">
          {error}
        </p>
      )}
      <ul
        aria-label="Tasks"
        data-task-tree
        className="overflow-hidden rounded-phone-card border border-line bg-panel py-1"
      >
        {rows.map((row) => {
          const t = byId.get(row.id)!
          const children = counts.get(row.id)
          const stage = t.stageId ? stages.get(t.stageId) : undefined
          const due = treeDue({ dueAt: t.dueAt, status: t.status, waiting: false }, today, timeZone)
          const deeper = row.depth > DEEPEST
          const done = isFinished(t.status)
          return (
            <li
              key={row.id}
              data-phone-tree-row={row.id}
              style={{ paddingLeft: 4 + (Math.min(row.depth, DEEPEST) - 1) * LEVEL_PX }}
              className="flex min-h-14 items-center gap-1 pr-3.5"
            >
              {children ? (
                <span className="grid size-11 shrink-0 place-items-center">
                  <ProgressSquare status={t.status} children={children} size={20} />
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => actions.setStatus(t.id, done ? 'todo' : 'done')}
                  aria-label={done ? `Not done “${t.title}”` : `Done “${t.title}”`}
                  className="grid size-11 shrink-0 place-items-center"
                >
                  <StatusMark status={t.status} size={20} />
                </button>
              )}
              <button
                type="button"
                onClick={() => inspect({ type: 'task', id: t.id })}
                className="flex min-w-0 flex-1 flex-col gap-1 py-2 text-left"
              >
                <span className={`truncate text-prose ${done ? 'text-subtle' : 'text-ink'}`}>
                  {deeper && <span className="text-subtle">… </span>}
                  {t.title}
                </span>
                {(stage || due || children) && (
                  <span className="flex flex-wrap items-center gap-1.5">
                    {stage && <StageLabel name={stage.name} quiet={stage.collapsed} />}
                    {due && (
                      <span
                        className={`inline-flex h-5.5 items-center gap-1 rounded-control px-2 text-meta font-medium ${
                          DUE_TONE[due.tone] ?? 'bg-warn-bg text-warn-t'
                        }`}
                      >
                        <FlagIcon size={12} aria-hidden="true" />
                        {due.text}
                      </span>
                    )}
                    {children && (
                      <span className="text-meta text-muted tabular-nums">
                        {children.done}/{children.counted}
                      </span>
                    )}
                  </span>
                )}
              </button>
            </li>
          )
        })}
        {creator && (
          <li>
            <button
              type="button"
              onClick={() => openNew(creator)}
              className="flex min-h-12 w-full items-center gap-3 px-4 text-prose text-muted"
            >
              <NewIcon size={18} aria-hidden="true" />
              New task
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}

/** Edit stages on a phone: the board's editor (artboard 29), which draws its own panel. */
export function EditStagesSheet({
  projectId,
  onClose,
}: {
  projectId: ProjectId
  onClose: () => void
}) {
  const project = useEveryProject().data?.find((p) => p.id === projectId)
  const stages = useQuery(projectTasksQuery(projectId)).data?.stages
  return project && stages ? (
    <EditStages project={project} stages={stages} onClose={onClose} />
  ) : null
}
