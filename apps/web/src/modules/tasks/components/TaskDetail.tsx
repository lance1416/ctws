import type { TaskResponse } from '@ctws/contracts'
import { useRef, useState, type KeyboardEvent } from 'react'
import { DangerAction, DangerZone } from '../../../platform/ui/DangerZone'
import { DetailPane } from '../../../platform/ui/DetailPane'
import { useUnsavedGuard } from '../../../platform/ui/unsavedGuard'
import { useRecordRecent } from '../../../shell/search/recent'
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

/**
 * ONE TASK, in the shell's detail pane: reading by default, the form behind Edit, and the one
 * irreversible action at the foot. Saving returns to reading -- reading back what was just written
 * is the next thing a person does.
 */
export function TaskDetail({ task, onClose, onSaved }: Props) {
  useRecordRecent({
    type: 'task',
    id: task.id,
    title: task.title,
    to: revealHref(task.projectId, task.id),
    kind: 'Task',
  })
  /** The pane's body: where focus goes back to, rather than <body> (WCAG 2.4.3). */
  const panel = useRef<HTMLDivElement>(null)
  const [editing, setEditing] = useState(false)
  const edit = useTaskDetailForm(task)
  const doomed = useDeleteTask(task)

  // A save in flight loses nothing, so it does not trap the person who pressed Save and then a
  // link. The save resets the form's dirty state when it lands, so the guard works again after.
  const guard = useUnsavedGuard(edit.isDirty && !edit.save.isPending, onClose)
  const backToPanel = () => queueMicrotask(() => panel.current?.focus())
  const stopEditing = () => {
    edit.form.reset()
    setEditing(false)
    backToPanel()
  }
  const requestClose = () => guard.leave(onClose)

  /**
   * ESCAPE UNWINDS ONE LEVEL: the discard question, then editing. The pane itself is the shell's
   * to close, so a press handled here says so with `preventDefault` and anything else travels on.
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
      {/* `flex-1 flex-col`: the pane's height reaches down to `DangerZone`, which needs a floor. */}
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
            <TaskReading task={task} onEdit={() => setEditing(true)} onClose={requestClose} />
            {/* Last, under a rule, in reading mode: destroying the task is not a peer of saving it. */}
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
