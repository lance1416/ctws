import { problemText } from '../../../platform/http/api'
import type { TaskResponse } from '@ctws/contracts'
import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { DangerAction, DangerZone } from '../../../platform/ui/DangerZone'
import { DetailPane } from '../../../platform/ui/DetailPane'
import { Toast } from '../../../platform/ui/Toast'
import { useUnsavedGuard } from '../../../platform/ui/unsavedGuard'
import { useRecordRecent } from '../../../shell/search'
import { revealHref } from '../logic/crumb'
import { TaskEditForm } from './TaskEditForm'
import { TaskReading } from './TaskReading'
import { useDeleteTask } from './useDeleteTask'
import { useTaskDetailForm } from './useTaskDetailForm'
import { useInspectedOf } from '../../../shell/layout'

type Props = {
  task: TaskResponse
  /** Dismissed without saving (and with nothing to lose, or after the user chose to discard). */
  onClose: () => void
  /** The save was accepted by the server; the pane stays open and the owner acknowledges it. */
  onSaved?: () => void
  /** Opened from a list in the inspector: that list's action, under the facts (U-29). */
  act?: ReactNode
  /** Where the frame around it finds how to close it: keeping an edit, as the ✕ does. */
  closing?: RefObject<() => void>
  /**
   * Deleted: where it was shown goes too. The inspector's, which nothing else closes (BUG-090);
   * a page's pane is closed by its list, whose row has gone.
   */
  onDeleted?: () => void
}

/** One task in the pane: reading by default, the form behind Edit. Saving returns to reading. */
export function TaskDetail({ task, onClose, onSaved }: Props) {
  // The pane's own ways out (Esc, a click outside) close as the body's ✕ does.
  const closing = useRef(onClose)
  // The pane is the inspector a task's own list opens it in: `L` links from it (BUG-080).
  useInspectedOf({ type: 'task', id: task.id, title: task.title })
  return (
    <DetailPane label="Task details" onClose={() => closing.current()}>
      <TaskDetailBody
        task={task}
        onClose={onClose}
        closing={closing}
        {...(onSaved ? { onSaved } : {})}
      />
    </DetailPane>
  )
}

/**
 * The task itself, wherever it is shown: the pane above, and the inspector, where it is edited in
 * place too (artboard 8, DES-001 "检查器里的窄版").
 */
export function TaskDetailBody({ task, onClose, onSaved, act, closing, onDeleted }: Props) {
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
  // What a save said where it lands, once: "Moved to Inbox" (FR-059).
  const [said, setSaid] = useState<string | null>(null)
  const unsay = useCallback(() => setSaid(null), [])
  const edit = useTaskDetailForm(task)
  const doomed = useDeleteTask(task, onDeleted)

  // A save in flight loses nothing, so it does not trap the person who pressed Save and then a
  // link. The save resets the form's dirty state when it lands, so the guard works again after.
  const guard = useUnsavedGuard(edit.isDirty && !edit.save.isPending)
  const backToPanel = () => queueMicrotask(() => panel.current?.focus())
  const stopEditing = () => {
    edit.form.reset()
    setEditing(false)
    backToPanel()
  }
  // The ✕ and a click outside close as Esc does: without asking, what was typed kept (FR-029).
  const requestClose = () => {
    if (editing) edit.keep()
    guard.release(onClose)
  }
  if (closing) closing.current = requestClose

  /**
   * Escape unwinds one level: the discard question, then editing, which it leaves without asking
   * and keeping what was typed for the next Edit (FR-029). Closing the pane is the shell's job, so
   * only a press handled here is marked with `preventDefault`.
   */
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return
    if (guard.asking) guard.keep()
    else if (editing) {
      edit.keep()
      stopEditing()
    } else return
    e.preventDefault()
  }

  return (
    <>
      {/* `flex-1 flex-col`: the height reaches down to `DangerZone`, which needs a floor. */}
      <div
        ref={panel}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="flex flex-1 flex-col focus:outline-none"
      >
        {editing ? (
          <>
            <TaskEditForm
              task={task}
              edit={edit}
              guard={guard}
              onCancel={() =>
                guard.leave(() => {
                  edit.discard()
                  stopEditing()
                })
              }
              onClose={requestClose}
              onSaved={(says) => {
                if (says) setSaid(says)
                setEditing(false)
                // The pressed control is gone: back to the panel, which listens for Escape.
                backToPanel()
                onSaved?.()
              }}
            />
            {/* The edit's last thing, under a rule (FR-035): destroying it is not a peer of
                saving it, and reading it offers neither. */}
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
        ) : (
          <TaskReading
            task={task}
            act={act}
            onEdit={() => {
              edit.start()
              setEditing(true)
            }}
            onClose={requestClose}
          />
        )}
        {doomed.remove.isError && (
          <p role="alert" className="text-ui text-stop-t">
            {problemText(doomed.remove.error) ?? "Couldn't delete it"}
          </p>
        )}
        {said && <Toast onGone={unsay}>{said}</Toast>}
      </div>
    </>
  )
}
