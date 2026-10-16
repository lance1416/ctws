import type { TaskResponse } from '@ctws/contracts'
import { useRef, useState, type KeyboardEvent } from 'react'
import { DangerAction, DangerZone } from '../../../platform/ui/DangerZone'
import { DetailPane } from '../../../platform/ui/DetailPane'
import { useUnsavedGuard } from '../../../platform/ui/unsavedGuard'
import { useRecordRecent } from '../../../shell/search'
import { revealHref } from '../crumb'
import { TaskEditForm } from './TaskEditForm'
import { TaskReading } from './TaskReading'
import { useDeleteTask } from './useDeleteTask'
import { useTaskDetailForm } from './useTaskDetailForm'

type Props = {
  task: TaskResponse
  /** Dismissed without saving (and with nothing to lose, or after the user chose to discard). */
  onClose: () => void
  /** The save was accepted by the server; the pane stays open and the owner acknowledges it. */
  onSaved?: () => void
}

/** One task in the pane: reading by default, the form behind Edit. Saving returns to reading. */
export function TaskDetail({ task, onClose, onSaved }: Props) {
  useRecordRecent({
    type: 'task',
    id: task.id,
    title: task.title,
    to: revealHref(task.projectId, task.id),
    kind: 'Task',
  })
  /** The pane's body: where focus goes back to, rather than <body>. */
  const panel = useRef<HTMLDivElement>(null)
  const [editing, setEditing] = useState(false)
  const edit = useTaskDetailForm(task)
  const doomed = useDeleteTask(task)

  // A save in flight loses nothing, so it does not trap the person who pressed Save and then a
  // link. The save resets the form's dirty state when it lands, so the guard works again after.
  const guard = useUnsavedGuard(edit.isDirty && !edit.save.isPending)
  const backToPanel = () => queueMicrotask(() => panel.current?.focus())
  const stopEditing = () => {
    edit.form.reset()
    setEditing(false)
    backToPanel()
  }
  const requestClose = () => guard.leave(onClose)

  /**
   * Escape unwinds one level: the discard question, then editing. Closing the pane is the shell's
   * job, so only a press handled here is marked with `preventDefault`.
   */
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return
    if (guard.asking) guard.keep()
    else if (editing) guard.leave(stopEditing)
    else return
    e.preventDefault()
  }

  return (
    <DetailPane label="Task details" onClose={requestClose}>
      {/* `flex-1 flex-col`: the height reaches down to `DangerZone`, which needs a floor. */}
      <div
        ref={panel}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="flex flex-1 flex-col focus:outline-none"
      >
        {editing ? (
          <TaskEditForm
            task={task}
            edit={edit}
            guard={guard}
            onCancel={() => guard.leave(stopEditing)}
            onClose={requestClose}
            onSaved={() => {
              setEditing(false)
              // The pressed control is gone: back to the panel, which listens for Escape.
              backToPanel()
              onSaved?.()
            }}
          />
        ) : (
          <>
            <TaskReading
              task={task}
              onEdit={() => {
                edit.start()
                setEditing(true)
              }}
              onClose={requestClose}
            />
            {/* Last, under a rule: destroying the task is not a peer of saving it. */}
            <DangerZone>
              <DangerAction
                label="Delete task"
                confirmLabel="Confirm deleting this task"
                message={doomed.message}
                busy={doomed.remove.isPending}
                onAsk={doomed.ask}
                onConfirm={() => doomed.remove.mutate()}
              />
            </DangerZone>
          </>
        )}
        {doomed.remove.isError && (
          <p role="alert" className="text-sm text-danger">
            {doomed.remove.error instanceof Error
              ? doomed.remove.error.message
              : "Couldn't delete it"}
          </p>
        )}
      </div>
    </DetailPane>
  )
}
