import { idFrom, taskId } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useCloseInspector, useListAct, useNarrowName } from '../../../shell/inspector'
import { taskQuery } from '../api'
import { TaskDetailBody } from './TaskDetail'

/** A task in the inspector: the pane's own reading and editing, in place (artboard 8). */
export function TaskNarrow({ id }: { id: string }) {
  const task = useQuery(taskQuery(idFrom(taskId, id)))
  const close = useCloseInspector()
  const act = useListAct()
  useNarrowName(task.data?.title)
  // Deleted, it hands focus to the row above it in the project's tree, desk or phone, as the row it
  // was opened from goes; the first row's goes to the tree's New task (BUG-094).
  const deleted = () => {
    const rows = [...document.querySelectorAll<HTMLElement>('[data-handle-id]')]
    const at = rows.findIndex((r) => r.dataset.handleId === id)
    const next =
      at > 0
        ? rows[at - 1]
        : at === 0
          ? document.querySelector<HTMLElement>('[data-tree-new-task]')
          : null
    close()
    next?.focus()
  }
  if (task.isError) return <p className="p-4 text-ui text-muted">This task is not here any more.</p>
  if (!task.data) return null
  return (
    <div className="flex flex-1 flex-col p-5">
      <TaskDetailBody task={task.data} onClose={close} act={act} onDeleted={deleted} />
    </div>
  )
}
