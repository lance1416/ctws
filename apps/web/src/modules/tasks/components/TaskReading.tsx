import type { TaskResponse, TaskStatus } from '@ctws/contracts'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { NoteBody } from '../../../platform/notes/NoteBody'
import { dayPhrase, ymd } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { ICON_BUTTON } from '../../../platform/ui/buttonStyles'
import { DetailHead } from '../../../platform/ui/DetailPane'
import { label } from '../../../platform/ui/formStyles'
import { EditIcon, FlagIcon, PLACE_ICON } from '../../../platform/ui/icons'
import { useTimeZone } from '../../../shell/auth'
import { LinkedSection } from '../../../shell/links'
import { ProjectSquare, useEveryProject } from '../../../shell/projects'
import { Resources } from '../../../shell/resources'
import { Timeline } from '../../../shell/timeline'
import { patchTask, projectTasksQuery } from '../api'
import { instantPhrase, lateNote } from '../logic/dueDates'
import { STATUS_LABEL } from '../logic/status'
import { ancestorsOf } from '../logic/tree/ancestors'
import { leafCounts } from '../logic/tree/leafCounts'
import { treeDue } from '../logic/tree/treeDue'
import { Dependencies } from './Dependencies'
import { ProgressSquare } from './ProgressSquare'
import { StatusMark } from './StatusMark'
import { StatusPicker } from './StatusPicker'
import { WRITE_AWAITS } from './useTaskDetailForm'

const DUE_CHIP = {
  soon: 'rounded-control bg-warn-bg px-2 py-0.5 text-warn-t',
  late: 'rounded-control bg-stop-bg px-2 py-0.5 text-stop-t',
} as const

/**
 * THE TASK IN THE INSPECTOR (FR-056, artboard 8), reading: where it sits, what it is, its fields
 * a line each, what it waits on or holds up, its notes, its resources, and what it is linked to.
 * Nothing a stray click can change but the status. A parent's status is its children's, and it
 * has no plan of its own (FR-038, FR-043).
 */
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
  const project = useEveryProject().data?.find((p) => p.id === task.projectId)
  // The project's tasks say where this one sits and whether it is a parent.
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

  /** The status writes at once, outside the leave guard: nothing is ever unsaved. */
  const setStatus = useMutation({
    mutationFn: (status: TaskStatus) => patchTask(task.id, { status }),
    meta: { changes: ['task'], awaits: WRITE_AWAITS, ownsError: true },
  })

  // A deadline whose day has gone says how late, in the row's words; a finished task is never
  // late, as on its row. Within the week, or missed, it wears the row's chip.
  const late = lateNote(task, timeZone, now)
  const due = treeDue({ dueAt: task.dueAt, status: task.status, waiting: false }, today, timeZone)
  const dueReading = (() => {
    if (!task.dueAt) return null
    const exact = instantPhrase(task.dueAt, today, timeZone)
    return late ? `${exact}, ${late}` : exact
  })()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <DetailHead
          kind={
            <>
              {project && <ProjectSquare project={project} />}
              <span data-detail-path className="truncate text-ui text-muted">
                {path.join(' / ')}
              </span>
            </>
          }
          // “Edit”, not “Edit task”: accessible names are matched by substring in one flat
          // namespace, and the guard's “Keep editing” already contains it.
          trailing={
            <button
              type="button"
              onClick={onEdit}
              aria-label="Edit"
              title="Edit"
              className={ICON_BUTTON}
            >
              <EditIcon size={16} aria-hidden="true" />
            </button>
          }
          onClose={onClose}
        />
        <h2 className="mt-1.5 flex items-start gap-2 text-subject text-ink">
          {/* The status is said in its field below; here it is the row's mark, for the eye. */}
          <span aria-hidden="true" className="mt-[0.2em] flex shrink-0">
            {counts ? (
              <ProgressSquare status={task.status} children={counts} size={20} />
            ) : (
              <StatusMark status={task.status} />
            )}
          </span>
          <span data-detail-title className="min-w-0">
            {task.title}
          </span>
        </h2>
      </div>

      <dl className="grid grid-cols-[16px_76px_minmax(0,1fr)] items-center gap-x-2.5">
        <Field icon={<StatusMark status={task.status} size={16} />} name="Status">
          {counts ? (
            // Its children's to change (FR-038).
            <span className="text-ui text-ink">{STATUS_LABEL[task.status]}</span>
          ) : (
            <StatusPicker
              status={task.status}
              busy={setStatus.isPending}
              onPick={(next) => setStatus.mutate(next)}
            />
          )}
        </Field>
        {!counts && (
          <Field icon={<PLACE_ICON.calendar size={16} aria-hidden="true" />} name="Planned">
            <span className="text-ui text-ink tabular-nums">
              {task.scheduledOn ? dayPhrase(task.scheduledOn, today) : 'Not set'}
            </span>
          </Field>
        )}
        <Field icon={<FlagIcon size={16} aria-hidden="true" />} name="Due">
          <span
            data-detail-due={due?.tone ?? 'none'}
            className={`justify-self-start text-ui tabular-nums ${
              due && (due.tone === 'soon' || due.tone === 'late') ? DUE_CHIP[due.tone] : 'text-ink'
            }`}
          >
            {dueReading ?? 'Not set'}
          </span>
        </Field>
      </dl>
      {setStatus.isError && (
        <p role="alert" className="text-ui text-stop-t">
          Couldn't change the status
        </p>
      )}

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

      <Resources owner={{ type: 'task', id: task.id }} />

      {/* Who or what it is about, after its own fields; the project is already in the head. */}
      <LinkedSection
        of={{ type: 'task', id: task.id }}
        types={['task', 'reading', 'person', 'meeting']}
      />

      <Timeline of={{ type: 'task', id: task.id }} />
    </div>
  )
}

/** One field, a line of its own: its icon, its name, then its value (artboard 8). */
function Field({ icon, name, children }: { icon: ReactNode; name: string; children: ReactNode }) {
  return (
    <>
      <span aria-hidden="true" className="flex text-muted">
        {icon}
      </span>
      <dt className="text-ui text-muted">{name}</dt>
      <dd className="flex min-h-8 min-w-0 items-center">{children}</dd>
    </>
  )
}
