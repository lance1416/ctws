import { TASK_STATUSES } from '@ctws/contracts'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useProjects } from '../../../shell/projects/api'
import { tasksKey } from '../api/taskCache'
import { createTask, listProjectTasks } from '../api/tasks'
import {
  addDays,
  dayEndIso,
  dayPhrase,
  nextMonday,
  todayIn,
  ymd,
} from '../../../platform/time/dates'
import { useTimeZone } from '../../../shell/auth/useMe'
import { ProjectChip } from '../../../shell/projects/ProjectPicker'
import { flatten } from '../tree/flatten'
import { MAX_DEPTH } from '../tree/drop'
import { decision, field, label, STATUS_CHIP } from '../../../platform/ui/formStyles'
import { PickOne } from '../../../platform/ui/inline'
import { Modal } from '../../../platform/ui/Modal'
import { DeadlineMark, PlanMark } from './TaskRowParts'
import { STATUS_LABEL } from '../statusLabel'
import { StatusMark } from './StatusMark'
import { useComposing } from '../../../platform/keyboard/composition'
import {
  createTaskForm,
  titleProblem,
  type CreateTaskForm,
  type CreateTaskValues,
} from '../taskForm'
import { DialogFooter } from '../../../platform/ui/DialogFooter'
import { useNow } from '../../../platform/time/useNow'

/**
 * NEW TASK: a task created WITH its details, in one request.
 *
 * It is an ADDITION, never a replacement. Typing one line and pressing Enter is a success
 * criterion of this project, so the quick-capture box and the project page's new-task box are
 * untouched: this is the other half of the same job -- the task you already know the shape of,
 * which otherwise costs a create, a click into the pane, an edit and a save.
 *
 * ONE request, not a POST then a PATCH: the create contract already accepts status, both dates and
 * the notes, so a half-made task never exists on the server and nothing has to be rolled back if
 * the second call fails.
 *
 * `⌘↵` / `Ctrl+↵` creates and STAYS, with the title cleared and refocused. Adding several in a row
 * is the real use of a dialog like this, and the rest of the form (project, parent, status, the
 * dates) is deliberately kept: they are what the next few tasks have in common. The notes are kept
 * too, and visibly so -- the textarea still shows them -- because the spec says the title is what
 * clears and a field quietly emptying itself is worse than one that did not.
 *
 * THE FORM IS `react-hook-form`'S, AND THE VALIDATION IS THE CONTRACT'S. Seven `useState`s, a
 * hand-written “Title is required” rule and a hand-assembled request body are gone: the form's values ARE
 * `createTaskBody`'s shape, `zodResolver(createTaskForm)` is the only thing that decides whether
 * they may be sent, and what `handleSubmit` hands over is the schema's own parsed output -- already
 * trimmed, already defaulted -- so the body is passed on rather than built a second time. The two
 * date buttons' values go through `setValue` rather than an input, because a named day is a
 * DECISION pressed, not a field typed into; that is what `Controller`/`setValue` exist for.
 */
/** `PickOne` has no null value, and the contract takes a uuid or null -- never the empty string. */
const TOP_LEVEL = '__top'

export function CreateTaskDialog({
  projectId,
  onClose,
}: {
  /** The project the dialog opens on; still changeable inside it. */
  projectId: string
  onClose: () => void
}) {
  const composing = useComposing()
  const titleField = useRef<HTMLInputElement>(null)
  const timeZone = useTimeZone()
  const todayYmd = todayIn(timeZone, useNow())

  /**
   * The deadline is chosen as a DAY and held as the INSTANT the contract wants, assembled the
   * moment the day is pressed instead of on submit. The dialog offers named days only (an exact
   * minute belongs in the detail pane), and a new deadline means "by the end of that day" -- the
   * same 23:59 the pane picks when there was no time to keep. Holding the instant is what lets the
   * form's values be the request body with nothing left to assemble.
   */
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
      status: 'backlog',
      scheduledOn: null,
      dueAt: null,
      notes: null,
    },
  })
  const project = watch('projectId')
  const parentId = watch('parentId')
  const scheduledOn = watch('scheduledOn')
  const dueAt = watch('dueAt')

  const projects = useProjects()
  // The chosen project's tasks, for the parent picker. Shares the cache entry the tree filled on
  // this page, so opening the dialog on the project you are looking at costs no request.
  const tasks = useQuery({
    queryKey: tasksKey(project),
    queryFn: () => listProjectTasks(project),
  })

  const DAYS: [string, string][] = [
    ['Today', todayYmd],
    ['Tomorrow', addDays(todayYmd, 1)],
    ['Next week', nextMonday(todayYmd)],
  ]
  /** Which named day the held instant IS, so the buttons can say which one is pressed. */
  const dueDay = dueAt ? ymd(new Date(dueAt), timeZone) : ''

  /**
   * The candidate parents, in the tree's own order and indented like it. Nothing is collapsed
   * here: a collapse is a reading state of the tree, not a fact about where a task may go.
   *
   * Depth 10 is the API's limit, so a task already at it cannot take a child -- offering it would
   * be offering a 409. The tree's inline add refuses the same thing in the same place.
   */
  const parents = flatten(tasks.data?.tasks ?? [], new Set()).flatMap((row) => {
    if (row.depth >= MAX_DEPTH) return []
    const task = tasks.data?.tasks.find((t) => t.id === row.id)
    return task ? [{ id: row.id, depth: row.depth, title: task.title }] : []
  })

  const create = useMutation({
    mutationFn: (body: CreateTaskValues) => createTask(body),
    meta: { awaits: [tasksKey(project)] },
  })

  /**
   * `stay` is the `⌘↵` route: create, keep the layer, clear the title and go back to it.
   *
   * `handleSubmit` is what refuses an invalid form, and it refuses BOTH routes -- the press and the
   * chord -- because both go through it. It also moves focus to the first field it refused
   * (`shouldFocusError`, on by default), which is the behaviour the hand-written rule had to spell
   * out with a ref.
   */
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

  // register returns the ref the library needs; the dialog needs its own, both for `Modal`'s
  // `initialFocus` and to go back to the field after a ⌘↵. Both get it.
  const { ref: registerTitle, ...titleRest } = register('title')

  const dueEcho = dueDay === '' ? null : `${dayPhrase(dueDay, todayYmd)} 23:59`
  const planEcho = !scheduledOn ? null : dayPhrase(scheduledOn, todayYmd)
  const problem = titleProblem(errors.title?.type as string | undefined)

  return (
    <Modal
      title="New task"
      onClose={onClose}
      initialFocus={titleField}
      // The footer already carries Cancel; a second dismiss in the header would be a third way
      // to leave one small form.
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
          // Caught here rather than on the title field so it works from the notes textarea too,
          // where a plain Enter is a newline and `⌘↵` is the only way to commit without reaching
          // for the mouse.
          e.preventDefault()
          void submit(true)()
        }}
        className="flex flex-col gap-5 px-5 py-4"
      >
        {/* The dialog opens with the TASK, in the detail pane's order: where it lives, then what
            it is called. The chip is never alone -- the project's NAME is in the control beside
            it (WCAG 1.4.1). */}
        <div>
          {/* The app's own picker, not a native `<select>`: the OS draws that popup and does
              not know this palette -- on Windows it came up white with the page's light-grey text
              on it, which is unreadable. */}
          <PickOne
            label="Projects"
            value={project}
            choices={(projects.data ?? [])
              .filter((p) => !p.archivedAt || p.id === project)
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
              /* Indented with figure spaces: the shape of the tree has to be in the text, which
                 is all one row of a picker renders. */
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

        {/* The same five marker shapes the rows speak, named, as native radios: one tab stop and
            the arrow keys inside it, for free and correctly. */}
        <div role="radiogroup" aria-labelledby="create-status-label">
          <span id="create-status-label" className={label}>
            Status
          </span>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {TASK_STATUSES.map((s) => (
              <label key={s} className={STATUS_CHIP}>
                <input
                  type="radio"
                  value={s}
                  {...register('status')}
                  className="absolute inset-0 cursor-pointer appearance-none opacity-0"
                />
                <span aria-hidden="true" className="flex">
                  <StatusMark status={s} />
                </span>
                {STATUS_LABEL[s]}
              </label>
            ))}
          </div>
        </div>

        {/* The two dates, wearing the glyph and the colour family the rows wear. One row of named
            decisions each and no exact field: the dialog is the fast way in, and the three days
            plus the way out are what a task being created actually knows. `aria-pressed`, because
            each button is a STATE here and not a one-shot action -- the form has not been sent
            yet, so the person has to be able to see (and hear) what is currently chosen. */}
        <div>
          <span className="flex items-center gap-1 text-sm text-deadline">
            <DeadlineMark filled={false} />
            Due
          </span>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {DAYS.map(([word, day]) => (
              <button
                key={word}
                type="button"
                aria-pressed={dueDay === day}
                onClick={() => setValue('dueAt', dayEndIso(day, timeZone))}
                className={decision}
              >
                Due {word.toLowerCase()}
              </button>
            ))}
            <button type="button" onClick={() => setValue('dueAt', null)} className={decision}>
              Clear the deadline
            </button>
          </div>
          {dueEcho && <p className="mt-1 text-xs tabular-nums text-ink-muted">{dueEcho}</p>}
        </div>

        <div>
          <span className="flex items-center gap-1 text-sm text-plan">
            <PlanMark />
            Plan
          </span>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {DAYS.map(([word, day]) => (
              <button
                key={word}
                type="button"
                aria-pressed={scheduledOn === day}
                onClick={() => setValue('scheduledOn', day)}
                className={decision}
              >
                Plan for {word.toLowerCase()}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setValue('scheduledOn', null)}
              className={decision}
            >
              Clear the plan
            </button>
          </div>
          {planEcho && <p className="mt-1 text-xs tabular-nums text-ink-muted">{planEcho}</p>}
        </div>

        {/* `htmlFor` rather than a wrapping label, for the reason the detail pane records: React
            writes a textarea's value into the element's text, so a wrapping label's name would be
            “Notes” plus whatever had been typed. */}
        <div>
          <label htmlFor="create-notes" className={label}>
            Notes
          </label>
          <textarea
            id="create-notes"
            // An empty textarea is no notes, not the empty string the contract would reject.
            // Guarded against the non-string the library hands this on the first render, before
            // the element exists: the default value for "no notes" is null, not ''.
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
            // Both chords, not one guessed from the user agent: the keys are what the hint is
            // for, and a wrong guess teaches the wrong key.
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
