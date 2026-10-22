import type { TaskResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useEveryProject } from '../../../shell/projects'
import { projectTasksQuery } from '../api'
import { ancestorsOf } from '../logic/tree/ancestors'
import { leafCounts } from '../logic/tree/leafCounts'

/**
 * Where a task sits, for the inspector's head, read or edited: its project (live or archived),
 * the path down to it ("Job hunt / Amazon / SDE II"), and its leaves' counts when it is a parent.
 */
export function useTaskPlace(task: TaskResponse) {
  const project = useEveryProject().data?.find((p) => p.id === task.projectId)
  const tree = useQuery(projectTasksQuery(task.projectId)).data?.tasks ?? []
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
  return { project, path, counts }
}
