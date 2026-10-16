import type { TaskResponse, TaskStatus } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { NoteBody } from '../../../platform/notes/NoteBody'
import { dayPhrase, todayIn } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import { DetailHead } from '../../../platform/ui/DetailPane'
import { label } from '../../../platform/ui/formStyles'
import { useTimeZone } from '../../../shell/auth/useMe'
import { LinkedSection } from '../../../shell/links/Links'
import { useEveryProject } from '../../../shell/projects/api'
import { ProjectChip } from '../../../shell/projects/ProjectPicker'
import { patchTask } from '../api/tasks'
import { instantPhrase, lateNote } from '../dueDates'
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
  const today = todayIn(timeZone, now)
  // Live and archived: the task's project may be archived.
  const projectName = useEveryProject().data?.find((p) => p.id === task.projectId)?.name ?? ''

  /** The status writes at once, outside the leave guard: nothing is ever unsaved. */
  const setStatus = useMutation({
    mutationFn: (status: TaskStatus) => patchTask(task.id, { status }),
    meta: { awaits: WRITE_AWAITS },
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
              <span className="truncate text-sm text-ink-muted">{projectName}</span>
            </>
          }
          // “Edit”, not “Edit task”: accessible names are matched by substring in one flat
          // namespace, and the guard's “Keep editing” already contains it.
          trailing={
            <button type="button" onClick={onEdit} className={BUTTON.secondary}>
              Edit
            </button>
          }
          onClose={onClose}
        />
        <h2 data-detail-title className="mt-0.5 text-lg font-semibold text-ink">
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
          <p role="alert" className="text-sm text-danger">
            Couldn't change the status
          </p>
        )}
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-sm text-deadline">
            <DeadlineMark filled={false} />
            Due
          </span>
          <span className={`text-sm tabular-nums ${dueOverdue ? 'text-missed' : 'text-ink'}`}>
            {dueReading ?? 'Not set'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-sm text-plan">
            <PlanMark />
            Plan
          </span>
          <span className="text-sm tabular-nums text-ink">{planReading ?? 'Not set'}</span>
        </div>
      </div>

      {/* Here, not in the form: an edge is written the moment it is named. */}
      <Dependencies taskId={task.id} projectId={task.projectId} />

      <div>
        <span className={label}>Notes</span>
        {/* At the 68ch reading measure; `NoteBody` shows the plain text until Markdown loads. */}
        {task.notes ? (
          <div data-detail-notes className="mt-1 max-w-[68ch] text-ink">
            <NoteBody source={task.notes} />
          </div>
        ) : (
          <p className="mt-1 text-sm text-ink-subtle">No notes yet</p>
        )}
      </div>

      {/* Who or what it is about, after its own fields; the project is already in the head. */}
      <LinkedSection of={{ type: 'task', id: task.id }} except={['project']} />
    </div>
  )
}
