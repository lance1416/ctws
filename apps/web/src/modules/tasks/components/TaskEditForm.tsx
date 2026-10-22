import type { TaskResponse } from '@ctws/contracts'
import { useEffect, useRef, useState } from 'react'
import { DayField } from '../../../shell/dates'
import { Controller } from 'react-hook-form'
import { problemText } from '../../../platform/http/api'
import { WritingMode } from '../../../platform/notes/WritingMode'
import {
  dayEndIso,
  dayPhrase,
  fromDayTimeInput,
  toDayTimeInput,
  ymd,
} from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { Button } from '../../../platform/ui/Button'
import { DetailHead } from '../../../platform/ui/DetailPane'
import { area, label } from '../../../platform/ui/formStyles'
import { FlagIcon, PLACE_ICON } from '../../../platform/ui/icons'
import { PickOne } from '../../../platform/ui/inline'
import type { UnsavedGuard } from '../../../platform/ui/unsavedGuard'
import { useTimeZone } from '../../../shell/auth'
import { ProjectChip, useEveryProject } from '../../../shell/projects'
import { instantPhrase, moveDueToDay } from '../logic/dueDates'
import { STATUS_LABEL } from '../logic/status'
import { DependencyRows } from './Dependencies'
import { Field, FIELDS } from './InspectorField'
import { ProgressSquare } from './ProgressSquare'
import { StageDot, StagePicker } from './StageField'
import { StatusMark } from './StatusMark'
import { DateDecisions, StatusRadios } from './TaskFields'
import type { useTaskDetailForm } from './useTaskDetailForm'
import { useTaskPlace } from './useTaskPlace'

/** For days the named ones miss: quieter by size, not by a fainter edge, which says "control". */
const exact =
  'h-9 w-full max-w-[14rem] rounded-control border border-line-strong bg-panel px-2 text-ui text-ink'

/**
 * THE TASK EDITED IN PLACE (FR-056): the inspector's own rows, each turned into its control --
 * the title where it is read, Status, Planned and Due on their lines, what it waits on beside
 * them, then the notes -- saved by one Save where Edit was, with the leave guard's question
 * inline. The head's project is the control that moves it. A parent's status and plan are its
 * children's (FR-038, FR-043).
 */
export function TaskEditForm({
  task,
  edit,
  guard,
  onCancel,
  onClose,
  onSaved,
}: {
  task: TaskResponse
  edit: ReturnType<typeof useTaskDetailForm>
  guard: UnsavedGuard
  onCancel: () => void
  onClose: () => void
  onSaved: () => void
}) {
  const { form, save, submit } = edit
  const { control, register, setValue, watch } = form
  const timeZone = useTimeZone()
  const today = ymd(useNow(), timeZone)
  const projects = useEveryProject()
  const { counts, stages } = useTaskPlace(task)

  const title = watch('title')
  const status = watch('status') ?? task.status
  const scheduledOn = watch('scheduledOn')
  const dueAt = watch('dueAt')
  const projectId = watch('projectId')

  // Edit is a request to type, so the title takes focus.
  const titleField = useRef<HTMLInputElement | null>(null)
  const { ref: registerTitle, ...titleRest } = register('title')
  useEffect(() => titleField.current?.focus(), [])

  /** Full-screen writing for the notes: a bigger place to type, inside the same form and guard. */
  const [writing, setWriting] = useState(false)
  // The guard's question is drawn in this form; a layer over it would hide the question, so the
  // question closes it, in the render that asks.
  if (writing && guard.asking) setWriting(false)

  // Every write here is an edit, so it says so (`shouldDirty`) to the guard and the PATCH.
  const dirty = { shouldDirty: true } as const
  /** Keeps the time of day when there already is one; a new deadline means "by the end of it". */
  const setDueDay = (day: string) =>
    setValue('dueAt', dueAt ? moveDueToDay(dueAt, day, timeZone) : dayEndIso(day, timeZone), dirty)

  return (
    <form onSubmit={submit(onSaved)} className="flex flex-col gap-4">
      <div>
        <DetailHead
          kind={
            // Where it is read, the project it is in; here also what moves it.
            <span className="flex min-w-0 items-center gap-1.5">
              <ProjectChip projectId={projectId} />
              <PickOne
                label="Projects"
                value={projectId}
                choices={(projects.data ?? [])
                  // A task may move only into a live project, or stay in its own archived one.
                  .filter((p) => !p.archivedAt || p.id === task.projectId)
                  .map((p) => ({ value: p.id, label: p.name }))}
                onPick={(id) => setValue('projectId', id, dirty)}
              />
            </span>
          }
          trailing={
            <span className="flex items-center gap-2">
              <Button look="secondary" onClick={onCancel}>
                Cancel
              </Button>
              <Button look="primary" type="submit" disabled={save.isPending || !title?.trim()}>
                Save
              </Button>
            </span>
          }
          onClose={onClose}
        />
        <h2 className="mt-1.5 flex items-start gap-2 text-subject text-ink">
          <span aria-hidden="true" className="mt-[0.2em] flex shrink-0">
            {counts ? (
              <ProgressSquare status={task.status} children={counts} size={20} />
            ) : (
              <StatusMark status={status} />
            )}
          </span>
          <input
            {...titleRest}
            // Two refs on one element: the library's, and this form's for the focus above.
            ref={(el) => {
              registerTitle(el)
              titleField.current = el
            }}
            aria-label="Title"
            className="-my-0.5 min-w-0 flex-1 rounded-control bg-transparent py-0.5 text-subject text-ink"
          />
        </h2>
      </div>

      {guard.asking && (
        <div role="alert" className="rounded-control border border-line-strong p-3 text-ui">
          <p className="text-ink">
            {guard.leaving
              ? 'You have unsaved changes. Leaving will discard them.'
              : 'You have unsaved changes. Closing will discard them.'}
          </p>
          <div className="mt-2 flex gap-2">
            <Button look="secondary" onClick={guard.discard}>
              Discard changes
            </Button>
            <Button look="primary" ref={guard.focusOn} onClick={guard.keep}>
              Keep editing
            </Button>
          </div>
        </div>
      )}
      {save.isError && (
        <p role="alert" className="text-ui text-stop-t">
          {problemText(save.error)}
        </p>
      )}

      <dl className={FIELDS}>
        <Field icon={<StatusMark status={status} size={16} />} name="Status" top={!counts}>
          {counts ? (
            <span className="text-ui text-ink">{STATUS_LABEL[task.status]}</span>
          ) : (
            <StatusRadios id="detail" field={register('status')} bare />
          )}
        </Field>
        {!counts && (
          <Field icon={<PLACE_ICON.calendar size={16} aria-hidden="true" />} name="Planned" top>
            <DateDecisions
              bare
              kind="plan"
              today={today}
              onDay={(day) => setValue('scheduledOn', day, dirty)}
              onClear={() => setValue('scheduledOn', null, dirty)}
              htmlFor="detail-go"
              exact={
                <Controller
                  name="scheduledOn"
                  control={control}
                  render={({ field: plan }) => (
                    <DayField
                      id="detail-go"
                      label="Plan"
                      value={plan.value ?? null}
                      onChange={(day) => setValue('scheduledOn', day, dirty)}
                      today={today}
                      className="mt-1.5 max-w-60"
                    />
                  )}
                />
              }
              echo={scheduledOn ? dayPhrase(scheduledOn, today) : null}
            />
          </Field>
        )}
        <Field icon={<FlagIcon size={16} aria-hidden="true" />} name="Due" top>
          <DateDecisions
            bare
            kind="due"
            today={today}
            onDay={setDueDay}
            onClear={() => setValue('dueAt', null, dirty)}
            htmlFor="detail-due"
            exact={
              // The form holds the instant; the field shows wall-clock text in the account's zone.
              <Controller
                name="dueAt"
                control={control}
                render={({ field: due }) => (
                  <input
                    id="detail-due"
                    type="datetime-local"
                    name={due.name}
                    ref={due.ref}
                    onBlur={due.onBlur}
                    value={toDayTimeInput(due.value ?? null, timeZone)}
                    onChange={(e) => due.onChange(fromDayTimeInput(e.target.value, timeZone))}
                    className={`${exact} mt-1.5`}
                  />
                )}
              />
            }
            echo={dueAt ? instantPhrase(dueAt, today, timeZone) : null}
          />
        </Field>
        {/* Stages are this project's: a move to another leaves it without one. */}
        {projectId === task.projectId && (
          <Field icon={<StageDot />} name="Stage" top>
            <StagePicker
              projectId={task.projectId}
              stages={stages}
              value={watch('stageId') ?? null}
              onChange={(stage) => setValue('stageId', stage, dirty)}
            />
          </Field>
        )}
        {/* Written the moment each is named or taken away, not by Save. */}
        <DependencyRows taskId={task.id} projectId={task.projectId} editing />
      </dl>

      {/* `htmlFor`, not a wrapping label: React writes a textarea's value into its text, so a
          wrapping label's name would be “Notes” plus whatever had been typed. */}
      <div>
        <div className="flex items-end justify-between gap-2">
          <label htmlFor="detail-notes" className={label}>
            Notes
          </label>
          <button
            type="button"
            onClick={() => setWriting(true)}
            className="-mb-0.5 h-7 rounded-control border border-line px-2 text-meta text-muted hover:border-line-strong hover:text-ink"
          >
            Full screen
          </button>
        </div>
        {/* Notes are prose, so the one reading measure in the app: 68ch. */}
        <textarea
          id="detail-notes"
          // Empty notes are null, not '': a PATCH clearing them has to say null.
          {...register('notes', {
            setValueAs: (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null),
          })}
          rows={5}
          className={`${area} mt-1.5 max-w-reading`}
        />
      </div>
      {writing && (
        <WritingMode
          heading={title?.trim() || 'Notes'}
          source={watch('notes') ?? ''}
          onChange={(next) => setValue('notes', next.trim() === '' ? null : next, dirty)}
          onClose={() => setWriting(false)}
        />
      )}
    </form>
  )
}
