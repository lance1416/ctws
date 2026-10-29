import type { TaskResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useEveryProject } from '../../../shell/projects'
import { projectTasksQuery } from '../api'
import { ancestorsOf } from '../logic/tree/ancestors'
import { leafCounts } from '../logic/tree/leafCounts'

/**
 * Where a task sits, for the inspector's head, read or edited: its project (live or archived),
 * the path down to it ("Job hunt / Amazon / SDE II"), its leaves' counts when it is a parent, and
 * its project's stages.
 */
export function useTaskPlace(task: TaskResponse) {
  const project = useEveryProject().data?.find((p) => p.id === task.projectId)
  const board = useQuery(projectTasksQuery(task.projectId)).data
  const tree = board?.tasks ?? []
  const stages = board?.stages ?? []
  const titleOf = new Map(tree.map((t) => [t.id, t.title]))
  const path = [
    project?.name,
    ...ancestorsOf(tree, task.id)
      .reverse()
      .map((id) => titleOf.get(id)),
  ].filter((step): step is string => step !== undefined)
  const counts = tree.some((t) => t.parentId === task.id)
    ? leafCounts(tree).get(task.id)
    : undefined
  // How many levels it takes with what is under it, for where Move to… may put it.
  const heightOf = (id: string, seen: Set<string>): number => {
    if (seen.has(id)) return 1
    const kids = tree.filter((t) => t.parentId === id)
    return 1 + Math.max(0, ...kids.map((k) => heightOf(k.id, new Set([...seen, id]))))
  }
  return { project, path, counts, stages, height: heightOf(task.id, new Set()) }
}
