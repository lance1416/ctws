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
  if (task.isError) return <p className="p-4 text-ui text-muted">This task is not here any more.</p>
  if (!task.data) return null
  return (
    <div className="flex flex-1 flex-col p-5">
      <TaskDetailBody task={task.data} onClose={close} act={act} />
    </div>
  )
}
