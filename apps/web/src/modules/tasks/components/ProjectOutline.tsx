import type { ProjectId } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { projectTasksQuery } from '../api'
import { isFinished } from '../logic/status'
import { flatten } from '../logic/tree/flatten'
import { leafCounts } from '../logic/tree/leafCounts'
import { ProgressSquare } from './ProgressSquare'
import { StatusMark } from '../../../platform/ui/StatusMark'
import { useTaskParam } from './tree/useTreeParams'

/** How far the outline sits in under its project's row, and each level further. */
const FIRST_INDENT = 22
const LEVEL = 18

/**
 * THE OPEN PROJECT'S OUTLINE in the sidebar (FR-021, artboard 8): its parents at every depth and
 * the leaves straight under it, in the tree's order, each with its progress or its status. A click
 * opens it on the page, in the inspector, as a row's would, so a long tree is a jump away.
 */
export function ProjectOutline({ projectId }: { projectId: ProjectId }) {
  const tasks = useQuery(projectTasksQuery(projectId)).data?.tasks ?? []
  const { openId, setOpenId } = useTaskParam()
  if (tasks.length === 0) return null
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const counts = leafCounts(tasks)
  const rows = flatten(tasks, new Set()).filter((row) => row.depth === 1 || row.hasChildren)
  return (
    // A group of jumps, not a second list of the tasks: the page's tree is the list (and what a
    // screen reader walks as one).
    <div role="group" aria-label="Outline" data-project-outline className="flex flex-col gap-px">
      {rows.map((row) => {
        const task = byId.get(row.id)!
        const children = row.hasChildren ? counts.get(row.id) : undefined
        return (
          <button
            key={row.id}
            type="button"
            onClick={() => setOpenId(row.id)}
            aria-current={row.id === openId ? 'true' : undefined}
            data-outline-row={row.id}
            style={{ paddingLeft: FIRST_INDENT + (row.depth - 1) * LEVEL }}
            className={`mx-1.5 flex h-7.5 w-[calc(100%-0.75rem)] items-center gap-2 rounded-control pr-2 text-left text-ui hover:bg-hover aria-[current]:bg-select ${
              isFinished(task.status) ? 'text-subtle' : 'text-ink'
            }`}
          >
            <span aria-hidden="true" className="flex shrink-0">
              {children ? (
                <ProgressSquare status={task.status} children={children} />
              ) : (
                <StatusMark status={task.status} size={14} />
              )}
            </span>
            <span data-outline-title className="min-w-0 flex-1 truncate">
              {task.title}
            </span>
          </button>
        )
      })}
    </div>
  )
}
