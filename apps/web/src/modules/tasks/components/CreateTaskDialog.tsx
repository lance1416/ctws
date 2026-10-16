import { MAX_TASK_DEPTH, NEW_TASK_STATUS, type ProjectId } from '@ctws/contracts'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useEveryProject } from '../../../shell/projects/api'
import { projectTasksQuery } from '../api/queries'
import { createTask } from '../api/tasks'
import { dayEndIso, dayPhrase, ymd } from '../../../platform/time/dates'
import { useTimeZone } from '../../../shell/auth/useMe'
import { ProjectChip } from '../../../shell/projects/ProjectPicker'
import { flatten } from '../tree/flatten'
import { field, label } from '../../../platform/ui/formStyles'
import { PickOne } from '../../../platform/ui/inline'
import { Modal } from '../../../platform/ui/Modal'
import { DateDecisions, StatusRadios } from './TaskFields'
import { useComposing } from '../../../platform/keyboard/composition'
import {
  createTaskForm,
  titleProblem,
  type CreateTaskForm,
  type CreateTaskValues,
} from '../taskForm'
import { DialogFooter } from '../../../platform/ui/DialogFooter'
import { useNow } from '../../../platform/time/useNow'

/** `PickOne` has no null value, and the contract takes a uuid or null -- never the empty string. */
const TOP_LEVEL = '__top'

/**
 * A task created with its details in one request. `⌘↵` creates and stays: the title clears and
 * takes focus, and everything else is kept for the next task.
 */
export function CreateTaskDialog({
  projectId,
  onClose,
}: {
  /** The project the dialog opens on; still changeable inside it. */
  projectId: ProjectId
  onClose: () => void
}) {
  const composing = useComposing()
  const titleField = useRef<HTMLInputElement>(null)
  const timeZone = useTimeZone()
  const todayYmd = ymd(useNow(), timeZone)

  // The deadline is picked as a named day and held as the end of that day, the instant the
  // contract takes.
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateTaskForm, unknown, CreateTaskValues>({
    resolver: zodResolver(createTaskForm),
    defaultValues: {
      projectId,
      parentId: null,
      title: '',
      status: NEW_TASK_STATUS,
      scheduledOn: null,
      dueAt: null,
      notes: null,
    },
  })
  const project = watch('projectId')
  const parentId = watch('parentId')
  const scheduledOn = watch('scheduledOn')
  const dueAt = watch('dueAt')

  const projects = useEveryProject()
  const tasks = useQuery(projectTasksQuery(project))

  /** Which named day the held instant is, so the buttons can say which one is pressed. */
  const dueDay = dueAt ? ymd(new Date(dueAt), timeZone) : ''

  /** The candidate parents in tree order, none collapsed and none already at the depth limit. */
  const parents = flatten(tasks.data?.tasks ?? [], new Set()).flatMap((row) => {
    if (row.depth >= MAX_TASK_DEPTH) return []
    const task = tasks.data?.tasks.find((t) => t.id === row.id)
    return task ? [{ id: row.id, depth: row.depth, title: task.title }] : []
  })

  const create = useMutation({
    mutationFn: (body: CreateTaskValues) => createTask(body),
    meta: { awaits: [projectTasksQuery(project).queryKey] },
  })

  /** `stay` is the `⌘↵` route. `handleSubmit` refuses an invalid form on both routes. */
  const submit = (stay: boolean) =>
    handleSubmit((values) => {
      if (create.isPending) return
      create.mutate(values, {
        onSuccess: () => {
          if (!stay) return onClose()
          setValue('title', '')
          titleField.current?.focus()
        },
      })
    })

  // The dialog needs its own ref too, for `initialFocus` and for ⌘↵; both get the element.
  const { ref: registerTitle, ...titleRest } = register('title')

  const problem = titleProblem(errors.title?.type as string | undefined)

  return (
    <Modal
      title="New task"
      onClose={onClose}
      initialFocus={titleField}
      // The footer already carries Cancel.
      dismissLabel={null}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit(false)()
        }}
        {...composing.bind}
        onKeyDown={(e) => {
          // isComposing: Enter confirms an IME candidate, it must not submit half a word.
          if (e.key !== 'Enter' || composing.composingNow(e)) return
          if (!e.metaKey && !e.ctrlKey) return
          // Caught on the form so it also works from the notes, where a plain Enter is a newline.
          e.preventDefault()
          void submit(true)()
        }}
        className="flex flex-col gap-5 px-5 py-4"
      >
        {/* The project's name sits beside its chip, so the colour is never the only signal. */}
        <div>
          {/* Not a native `<select>`: the OS draws that popup and ignores this palette. */}
          <PickOne
            label="Projects"
            value={project}
            choices={(projects.data ?? [])
              // Live projects, and the archived one the dialog was opened on.
              .filter((p) => !p.archivedAt || p.id === projectId)
              .map((p) => ({
                value: p.id,
                label: p.name,
                mark: <ProjectChip projectId={p.id} />,
              }))}
            onPick={(id) => {
              setValue('projectId', id)
              // A parent belongs to a project; keeping the old one would send a foreign id.
              setValue('parentId', null)
            }}
          />
          <input
            {...titleRest}
            ref={(el) => {
              registerTitle(el)
              titleField.current = el
            }}
            aria-label="Title"
            aria-invalid={errors.title ? true : undefined}
            className="mt-0.5 w-full rounded-md bg-transparent py-0.5 text-lg font-semibold text-ink"
          />
        </div>

        <div>
          <span className={label}>Put it under</span>
          <div className="mt-1.5">
            <PickOne
              label="Put it under"
              value={parentId ?? TOP_LEVEL}
              /* Indented with figure spaces: a picker row renders text only. */
              choices={[
                { value: TOP_LEVEL, label: 'Top level' },
                ...parents.map((p) => ({
                  value: p.id,
                  label: `${' '.repeat((p.depth - 1) * 2)}${p.title}`,
                })),
              ]}
              onPick={(v) => setValue('parentId', v === TOP_LEVEL ? null : v)}
            />
          </div>
        </div>

        <StatusRadios id="create" field={register('status')} />

        {/* Named days only. Each button shows a pressed state, since nothing is sent yet. */}
        <DateDecisions
          kind="due"
          today={todayYmd}
          pressed={(day) => dueDay === day}
          onDay={(day) => setValue('dueAt', dayEndIso(day, timeZone))}
          onClear={() => setValue('dueAt', null)}
          echo={dueDay === '' ? null : `${dayPhrase(dueDay, todayYmd)} 23:59`}
        />
        <DateDecisions
          kind="plan"
          today={todayYmd}
          pressed={(day) => scheduledOn === day}
          onDay={(day) => setValue('scheduledOn', day)}
          onClear={() => setValue('scheduledOn', null)}
          echo={scheduledOn ? dayPhrase(scheduledOn, todayYmd) : null}
        />

        {/* `htmlFor`, not a wrapping label: React writes a textarea's value into its text, which
            a wrapping label would add to its name. */}
        <div>
          <label htmlFor="create-notes" className={label}>
            Notes
          </label>
          <textarea
            id="create-notes"
            // Empty is null, not the '' the contract rejects; the first render hands this a
            // non-string.
            {...register('notes', {
              setValueAs: (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null),
            })}
            rows={3}
            className={`${field} mt-1.5 max-w-[68ch]`}
          />
        </div>

        {problem && (
          <p role="alert" className="text-sm text-danger">
            {problem}
          </p>
        )}
        {create.isError && (
          <p role="alert" className="text-sm text-danger">
            Couldn't create it. Your text is still here — try again.
          </p>
        )}

        <DialogFooter
          submit="Create"
          onCancel={onClose}
          hint={
            // Both chords: one guessed from the user agent could teach the wrong key.
            <p className="text-xs text-ink-muted">
              <kbd className="rounded border border-rule-strong px-1.5 text-xs leading-5">⌘↵</kbd> /{' '}
              <kbd className="rounded border border-rule-strong px-1.5 text-xs leading-5">
                Ctrl↵
              </kbd>{' '}
              Create and add another
            </p>
          }
        />
      </form>
    </Modal>
  )
}
