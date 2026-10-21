import type { TaskResponse, TaskStatus } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { NoteBody } from '../../../platform/notes/NoteBody'
import { dayPhrase, ymd } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { Button } from '../../../platform/ui/Button'
import { DetailHead } from '../../../platform/ui/DetailPane'
import { label } from '../../../platform/ui/formStyles'
import { useTimeZone } from '../../../shell/auth'
import { LinkedSection } from '../../../shell/links'
import { ProjectChip, useEveryProject } from '../../../shell/projects'
import { patchTask } from '../api'
import { instantPhrase, lateNote } from '../logic/dueDates'
import { Dependencies } from './Dependencies'
import { StatusPicker } from './StatusPicker'
import { DeadlineMark, PlanMark } from './TaskRowParts'
import { WRITE_AWAITS } from './useTaskDetailForm'

/** The pane's default: the whole task, nothing a stray click can change but the status menu. */
export function TaskReading({
  task,
  onEdit,
  onClose,
}: {
  task: TaskResponse
  onEdit: () => void
  onClose: () => void
}) {
  const timeZone = useTimeZone()
  const now = useNow()
  const today = ymd(now, timeZone)
  // Live and archived: the task's project may be archived.
  const projectName = useEveryProject().data?.find((p) => p.id === task.projectId)?.name ?? ''

  /** The status writes at once, outside the leave guard: nothing is ever unsaved. */
  const setStatus = useMutation({
    mutationFn: (status: TaskStatus) => patchTask(task.id, { status }),
    meta: { changes: ['task'], awaits: WRITE_AWAITS, ownsError: true },
  })

  // A deadline whose day has gone says how late, in the row's words and `missed` colour; a
  // finished task is never late, as on its row.
  const late = lateNote(task, timeZone, now)
  const dueOverdue = late !== null
  const dueReading = (() => {
    if (!task.dueAt) return null
    const exact = instantPhrase(task.dueAt, today, timeZone)
    return late ? `${exact} · ${late}` : exact
  })()
  const planReading = task.scheduledOn ? dayPhrase(task.scheduledOn, today) : null

  return (
    <div className="flex flex-col gap-4">
      <div>
        <DetailHead
          kind={
            <>
              <ProjectChip projectId={task.projectId} />
              <span className="truncate text-ui text-muted">{projectName}</span>
            </>
          }
          // “Edit”, not “Edit task”: accessible names are matched by substring in one flat
          // namespace, and the guard's “Keep editing” already contains it.
          trailing={
            <Button look="secondary" onClick={onEdit}>
              Edit
            </Button>
          }
          onClose={onClose}
        />
        <h2 data-detail-title className="mt-0.5 text-subject text-ink">
          {task.title}
        </h2>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className={label}>Status</span>
          <StatusPicker
            status={task.status}
            busy={setStatus.isPending}
            onPick={(next) => setStatus.mutate(next)}
          />
        </div>
        {setStatus.isError && (
          <p role="alert" className="text-ui text-stop-t">
            Couldn't change the status
          </p>
        )}
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-ui text-warn-t">
            <DeadlineMark filled={false} />
            Due
          </span>
          <span className={`text-ui tabular-nums ${dueOverdue ? 'text-stop-t' : 'text-ink'}`}>
            {dueReading ?? 'Not set'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-ui text-go-t">
            <PlanMark />
            Plan
          </span>
          <span className="text-ui tabular-nums text-ink">{planReading ?? 'Not set'}</span>
        </div>
      </div>

      {/* Here, not in the form: an edge is written the moment it is named. */}
      <Dependencies taskId={task.id} projectId={task.projectId} />

      <div>
        <span className={label}>Notes</span>
        {/* At the 68ch reading measure; `NoteBody` shows the plain text until Markdown loads. */}
        {task.notes ? (
          <div data-detail-notes className="mt-1 max-w-reading text-ink">
            <NoteBody source={task.notes} />
          </div>
        ) : (
          <p className="mt-1 text-ui text-subtle">No notes yet</p>
        )}
      </div>

      {/* Who or what it is about, after its own fields; the project is already in the head. */}
      <LinkedSection
        of={{ type: 'task', id: task.id }}
        types={['task', 'reading', 'person', 'meeting']}
      />
    </div>
  )
}
