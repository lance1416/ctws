import type { TaskResponse, TaskStatus } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { NoteBody } from '../../../platform/notes/NoteBody'
import { dayPhrase, ymd } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { ICON_BUTTON } from '../../../platform/ui/buttonStyles'
import { DetailHead } from '../../../platform/ui/DetailPane'
import { label } from '../../../platform/ui/formStyles'
import { EditIcon, FlagIcon, OpenFullIcon, PLACE_ICON } from '../../../platform/ui/icons'
import { useTimeZone } from '../../../shell/auth'
import { LinkedChips } from '../../../shell/links'
import { ProjectSquare } from '../../../shell/projects'
import { Resources } from '../../../shell/resources'
import { Timeline } from '../../../shell/timeline'
import { patchTask } from '../api'
import { openHref } from '../logic/crumb'
import { instantPhrase, lateNote } from '../logic/dueDates'
import { STATUS_LABEL } from '../logic/status'
import { treeDue } from '../logic/tree/treeDue'
import { DependencyRows } from './Dependencies'
import { Field, FIELDS } from './InspectorField'
import { ProgressSquare } from './ProgressSquare'
import { StatusMark } from './StatusMark'
import { StageDot } from './StageField'
import { StatusPicker } from './StatusPicker'
import { StageLabel } from '../../../platform/ui/StageLabel'
import { WRITE_AWAITS } from './useTaskDetailForm'
import { useTaskPlace } from './useTaskPlace'

const DUE_CHIP = {
  soon: 'rounded-control bg-warn-bg px-2 py-0.5 text-warn-t',
  late: 'rounded-control bg-stop-bg px-2 py-0.5 text-stop-t',
} as const

/**
 * THE TASK IN THE INSPECTOR (FR-056, artboard 8), reading: where it sits, what it is, its fields
 * a line each with what it waits on or holds up among them, its notes, its resources, and what
 * it is linked to.
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
  const { project, path, counts, stages } = useTaskPlace(task)
  const stage = stages.find((s) => s.id === task.stageId)
  const { pathname } = useLocation()

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
            <>
              {/* No page of its own: its full page is its project's, with it open there. Not
                  offered on that page, where it already is. */}
              {pathname !== `/projects/${task.projectId}` && (
                <Link
                  to={openHref(task.projectId, task.id)}
                  aria-label="Open full page"
                  title="Open full page"
                  className={ICON_BUTTON}
                >
                  <OpenFullIcon size={16} aria-hidden="true" />
                </Link>
              )}
              <button
                type="button"
                onClick={onEdit}
                aria-label="Edit"
                title="Edit"
                className={ICON_BUTTON}
              >
                <EditIcon size={16} aria-hidden="true" />
              </button>
            </>
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

      <dl className={FIELDS}>
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
        {/* A field without a value is not a line (DES-001 "Empty values", I-02). */}
        {!counts && task.scheduledOn && (
          <Field icon={<PLACE_ICON.calendar size={16} aria-hidden="true" />} name="Planned">
            <span className="text-ui text-ink tabular-nums">
              {dayPhrase(task.scheduledOn, today)}
            </span>
          </Field>
        )}
        {dueReading && (
          <Field icon={<FlagIcon size={16} aria-hidden="true" />} name="Due">
            <span
              data-detail-due={due?.tone ?? 'none'}
              className={`justify-self-start text-ui tabular-nums ${
                due && (due.tone === 'soon' || due.tone === 'late')
                  ? DUE_CHIP[due.tone]
                  : 'text-ink'
              }`}
            >
              {dueReading}
            </span>
          </Field>
        )}
        {stage && (
          <Field icon={<StageDot />} name="Stage">
            <StageLabel name={stage.name} quiet={stage.collapsed} />
          </Field>
        )}
        {/* Beside the fields, each only when there is one (P-07); changed in the edit. */}
        <DependencyRows
          taskId={task.id}
          title={task.title}
          projectId={task.projectId}
          editing={false}
        />
      </dl>
      {setStatus.isError && (
        <p role="alert" className="text-ui text-stop-t">
          Couldn't change the status
        </p>
      )}

      {/* Notes only when there are some: an empty section is no news (I-02). */}
      {task.notes && (
        <div>
          <span className={label}>Notes</span>
          {/* At the 68ch reading measure; `NoteBody` shows the plain text until Markdown loads. */}
          <div data-detail-notes className="mt-1 max-w-reading text-ink">
            <NoteBody source={task.notes} />
          </div>
        </div>
      )}

      <Resources owner={{ type: 'task', id: task.id }} />

      {/* Who or what it is about, after its own fields; the project is already in the head. */}
      <LinkedChips
        of={{ type: 'task', id: task.id }}
        types={['task', 'reading', 'person', 'meeting', 'organisation']}
      />

      <Timeline of={{ type: 'task', id: task.id }} />
    </div>
  )
}
