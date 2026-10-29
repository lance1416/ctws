import type { TaskResponse } from '@ctws/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForgetRecent } from '../../../shell/search'
import { deleteTask, projectTasksQuery } from '../api'
import { WRITE_AWAITS } from './useTaskDetailForm'

/**
 * Deleting takes the subtree, so the question counts what is lost, read live because the page
 * behind may never have loaded this tree. `message` is null while counting.
 */
export function useDeleteTask(
  task: TaskResponse,
  /** Run once it is gone, even if what showed it has gone first (its read now answers 404). */
  onDeleted?: () => void,
) {
  const qc = useQueryClient()
  const [descendants, setDescendants] = useState<number | null>(null)
  const ask = async () => {
    setDescendants(null)
    try {
      const all = await qc.fetchQuery({ ...projectTasksQuery(task.projectId), staleTime: 0 })
      let count = 0
      let frontier = [task.id]
      while (frontier.length > 0) {
        const kids = all.tasks.filter((t) => t.parentId !== null && frontier.includes(t.parentId))
        count += kids.length
        frontier = kids.map((t) => t.id)
      }
      setDescendants(count)
    } catch {
      // Without the count the person would be confirming blind; say so and let them cancel.
      setDescendants(-1)
    }
  }
  const forget = useForgetRecent()
  const remove = useMutation({
    mutationFn: () => deleteTask(task.id),
    meta: { changes: ['task'], awaits: WRITE_AWAITS, ownsError: true },
    onSuccess: () => {
      forget('task', task.id)
      onDeleted?.()
    },
  })
  const message =
    descendants === null
      ? null
      : descendants < 0
        ? `Delete “${task.title}” and all its subtasks. This cannot be undone.`
        : descendants === 0
          ? `Delete “${task.title}”. This cannot be undone.`
          : `Delete “${task.title}” and its ${descendants} subtasks. This cannot be undone.`
  return { message, ask, remove }
}
