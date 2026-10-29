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
import { area, boxed, label } from '../../../platform/ui/formStyles'
import { FlagIcon, PLACE_ICON } from '../../../platform/ui/icons'
import { PickOne } from '../../../platform/ui/inline'
import { usePhone } from '../../../platform/ui/phone'
import type { UnsavedGuard } from '../../../platform/ui/unsavedGuard'
import { useTimeZone } from '../../../shell/auth'
import { MoveToProject, ProjectSquare, useEveryProject } from '../../../shell/projects'
import { instantPhrase, moveDueToDay } from '../logic/dueDates'
import { STATUS_LABEL } from '../../../platform/ui/StatusMark'
import { DependencyRows } from './Dependencies'
import { Field, FIELDS } from './InspectorField'
import { ProgressSquare } from './ProgressSquare'
import { StageDot, StagePicker } from './StageField'
import { StatusMark } from '../../../platform/ui/StatusMark'
import { DateDecisions, StatusRadios } from './TaskFields'
import type { useTaskDetailForm } from './useTaskDetailForm'
import { useTaskPlace } from './useTaskPlace'

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
  /** Called once the server has it, with what to say of it, if anything. */
  onSaved: (says?: string) => void
}) {
  const { form, save, submit } = edit
  const { control, register, setValue, watch } = form
  const timeZone = useTimeZone()
  const today = ymd(useNow(), timeZone)
  const projects = useEveryProject()
  const { counts, stages, path, height } = useTaskPlace(task)
  const phone = usePhone()
  // A phone's Move to… (FR-088): its pick is in the form, saved with the rest; the parent's name
  // is kept for the head, the tree it is in not being the one loaded.
  const [moving, setMoving] = useState(false)
  const [under, setUnder] = useState<string | null>(null)
  const [stageBusy, setStageBusy] = useState(false)

  const title = watch('title')
  const status = watch('status') ?? task.status
  const scheduledOn = watch('scheduledOn')
  const dueAt = watch('dueAt')
  const projectId = watch('projectId')
  const movingTo = projects.data?.find((p) => p.id === projectId)

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

  const mover = moving && (
    <MoveToProject
      of={{ type: 'task', id: task.id }}
      title={`Move “${title || task.title}” to`}
      height={height}
      busy={false}
      error={null}
      onPick={(to) => {
        setValue('projectId', to, dirty)
        setValue('parentId', null, dirty)
        setUnder(null)
        setMoving(false)
      }}
      onPickParent={({ project, parent }) => {
        setValue('projectId', project.id, dirty)
        setValue('parentId', parent.id, dirty)
        setUnder(parent.title)
        setMoving(false)
      }}
      onClose={() => setMoving(false)}
    />
  )

  return (
    <>
      <form
        onSubmit={submit(() =>
          onSaved(movingTo?.isInbox && projectId !== task.projectId ? 'Moved to Inbox' : undefined),
        )}
        // Ctrl Enter saves from any field (FR-029); a plain Enter in the notes is a new line.
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.nativeEvent.isComposing) return
          e.preventDefault()
          if (!save.isPending && !stageBusy && title?.trim()) e.currentTarget.requestSubmit()
        }}
        className="flex flex-col gap-4"
      >
        <div>
          <DetailHead
            kind={
              // Where it is read, the project it is in; here also what moves it.
              <span className="flex min-w-0 items-center gap-1.5">
                {movingTo && <ProjectSquare project={movingTo} />}
                {phone ? (
                  <button
                    type="button"
                    onClick={() => setMoving(true)}
                    className="flex min-h-11 min-w-0 items-center gap-1 text-ui text-muted"
                  >
                    <span className="truncate">
                      {form.formState.dirtyFields.projectId || form.formState.dirtyFields.parentId
                        ? [movingTo?.name, under].filter(Boolean).join(' › ')
                        : path.join(' › ')}
                    </span>
                    <span className="shrink-0 text-ink underline underline-offset-2">Move to…</span>
                  </button>
                ) : (
                  <PickOne
                    label="Projects"
                    value={projectId}
                    choices={(projects.data ?? [])
                      // A task may move only into a live project, or stay in its own archived one.
                      .filter((p) => !p.archivedAt || p.id === task.projectId)
                      .map((p) => ({ value: p.id, label: p.name }))}
                    onPick={(id) => {
                      setValue('projectId', id, dirty)
                      setValue('parentId', null, dirty)
                    }}
                  />
                )}
              </span>
            }
            trailing={
              <span className="flex items-center gap-2">
                <Button look="secondary" onClick={onCancel}>
                  Cancel
                </Button>
                <Button
                  look="primary"
                  type="submit"
                  disabled={save.isPending || stageBusy || !title?.trim()}
                >
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
              className="-my-0.5 min-w-0 flex-1 rounded-control bg-transparent py-0.5 max-lg:min-h-11 text-subject text-ink"
            />
          </h2>
        </div>

        {guard.asking && (
          <div role="alert" className="rounded-control border border-line-strong p-3 text-ui">
            <p className="text-ink">
              {guard.leaving
                ? 'You have unsaved changes. Leaving will discard them.'
                : 'Discard the changes?'}
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
              <StatusRadios
                id="detail"
                field={register('status')}
                current={status}
                onPick={(s) => setValue('status', s, dirty)}
                bare
              />
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
                // The day typed or pointed at as everywhere (FR-034, I-01), its time after it; the
                // form holds the instant, read and written on the account's clock.
                <span className="mt-1.5 flex flex-wrap items-start gap-2">
                  <DayField
                    id="detail-due"
                    label="Due"
                    value={dueAt ? ymd(new Date(dueAt), timeZone) : null}
                    onChange={(day) => (day ? setDueDay(day) : setValue('dueAt', null, dirty))}
                    today={today}
                    className="max-w-60 min-w-0 flex-1"
                  />
                  <input
                    type="time"
                    aria-label="Due time"
                    disabled={!dueAt}
                    value={dueAt ? toDayTimeInput(dueAt, timeZone).slice(11) : ''}
                    onChange={(e) => {
                      if (!dueAt) return
                      const day = ymd(new Date(dueAt), timeZone)
                      // An emptied time is the end of the day, as a deadline set by day alone is.
                      setValue(
                        'dueAt',
                        e.target.value
                          ? fromDayTimeInput(`${day}T${e.target.value}`, timeZone)
                          : dayEndIso(day, timeZone),
                        dirty,
                      )
                    }}
                    className={`${boxed} w-28 shrink-0 disabled:opacity-50`}
                  />
                </span>
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
                onBusy={setStageBusy}
              />
            </Field>
          )}
          {/* Written the moment each is named or taken away, not by Save. */}
          <DependencyRows taskId={task.id} title={task.title} projectId={task.projectId} editing />
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
              className="-mb-0.5 h-7 rounded-control border border-line px-2 text-meta text-muted hover:border-line-strong hover:text-ink max-lg:tap"
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
      {/* Outside the form: its keys and presses are not the form's. */}
      {mover}
    </>
  )
}
