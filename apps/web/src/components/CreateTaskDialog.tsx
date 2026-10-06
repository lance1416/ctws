import { TASK_STATUSES, type TaskStatus } from '@ctws/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { listProjects } from '../api/projects'
import { refreshTasks, tasksKey } from '../api/taskCache'
import { createTask, listProjectTasks, type NewTask } from '../api/tasks'
import { addDays, dayPhrase, nextMonday, ymd } from '../dueAt'
import { projectRailClass } from '../projectColor'
import { flatten } from '../tree/flatten'
import { MAX_DEPTH } from '../tree/drop'
import { decision, field, label } from './formStyles'
import { Modal } from './Modal'
import { DeadlineMark, PlanMark } from './RowParts'
import { STATUS_LABEL } from './TaskDetail'
import { StatusMark } from './StatusMark'

/**
 * 「新建」: a task created WITH its details, in one request.
 *
 * It is an ADDITION, never a replacement. 「敲一行回车即落」 is a success criterion of this
 * project, so the quick-capture box and the project page's 新任务 box are untouched: this is the
 * other half of the same job -- the task you already know the shape of, which otherwise cost a
 * create, then a click into the pane, then 编辑, then a save.
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
 */
export function CreateTaskDialog({
  projectId,
  onClose,
}: {
  /** The project the dialog opens on; still changeable inside it. */
  projectId: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const titleField = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [project, setProject] = useState(projectId)
  const [parentId, setParentId] = useState('')
  const [status, setStatus] = useState<TaskStatus>('backlog')
  const [scheduledOn, setScheduledOn] = useState('')
  // The deadline is kept as a DAY and turned into an instant on submit. The dialog offers named
  // days only (an exact minute belongs in the detail pane), and a new deadline means "by the end
  // of that day" -- the same 23:59 the pane picks when there was no time to keep.
  const [dueDay, setDueDay] = useState('')
  const [notes, setNotes] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  // The chosen project's tasks, for 放在谁下面. Shares the cache entry the tree already filled on
  // this page, so opening the dialog on the project you are looking at costs no request.
  const tasks = useQuery({
    queryKey: tasksKey(project),
    queryFn: () => listProjectTasks(project),
  })

  const todayYmd = ymd(new Date())
  const DAYS: [string, string][] = [
    ['今天', todayYmd],
    ['明天', addDays(todayYmd, 1)],
    ['下周', nextMonday(todayYmd)],
  ]

  /**
   * The candidate parents, in the tree's own order and indented like it. Nothing is collapsed
   * here: a collapse is a reading state of the tree, not a fact about where a task may go.
   *
   * Depth 10 is the API's limit, so a task already at it cannot take a child -- offering it would
   * be offering a 409. The tree's inline add refuses the same thing in the same place.
   */
  const parents = flatten(tasks.data ?? [], new Set()).flatMap((row) => {
    if (row.depth >= MAX_DEPTH) return []
    const task = tasks.data?.find((t) => t.id === row.id)
    return task ? [{ id: row.id, depth: row.depth, title: task.title }] : []
  })

  const create = useMutation({
    mutationFn: (body: NewTask) => createTask(body),
    onSuccess: () => refreshTasks(qc, project),
  })

  /** `stay` is the `⌘↵` route: create, keep the layer, clear the title and go back to it. */
  const submit = (stay: boolean) => {
    const t = title.trim()
    if (!t) {
      setProblem('请先写标题')
      titleField.current?.focus()
      return
    }
    if (create.isPending) return
    setProblem(null)
    const body: NewTask = {
      projectId: project,
      parentId: parentId === '' ? null : parentId,
      title: t,
      status,
      scheduledOn: scheduledOn === '' ? null : scheduledOn,
      dueAt: dueDay === '' ? null : new Date(`${dueDay}T23:59:00`).toISOString(),
      notes: notes.trim() === '' ? null : notes,
    }
    create.mutate(body, {
      onSuccess: () => {
        if (!stay) return onClose()
        setTitle('')
        titleField.current?.focus()
      },
    })
  }

  const dueEcho = dueDay === '' ? null : `${dayPhrase(dueDay, todayYmd)} 23:59`
  const planEcho = scheduledOn === '' ? null : dayPhrase(scheduledOn, todayYmd)

  return (
    <Modal
      title="新建任务"
      onClose={onClose}
      initialFocus={titleField}
      // The footer already carries 取消; a second dismiss in the header would be a third way to
      // leave one small form.
      dismissLabel={null}
      className="rounded-lg"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit(false)
        }}
        onKeyDown={(e) => {
          // isComposing: Enter confirms an IME candidate, it must not submit half a word.
          if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
          if (!e.metaKey && !e.ctrlKey) return
          // Caught here rather than on the title field so it works from the notes textarea too,
          // where a plain Enter is a newline and `⌘↵` is the only way to commit without reaching
          // for the mouse.
          e.preventDefault()
          submit(true)
        }}
        className="flex flex-col gap-5 px-5 py-4"
      >
        {/* The dialog opens with the TASK, in the detail pane's order: where it lives, then what
            it is called. The chip is never alone -- the project's NAME is in the control beside
            it (WCAG 1.4.1). */}
        <div>
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`h-3.5 w-[3px] shrink-0 rounded-full ${projectRailClass(project)}`}
            />
            <select
              aria-label="项目"
              value={project}
              onChange={(e) => {
                setProject(e.target.value)
                // A parent belongs to a project; keeping the old one would send a foreign id.
                setParentId('')
              }}
              className="-ml-0.5 max-w-full rounded-lg bg-transparent py-0.5 text-sm text-fg-muted hover:text-fg"
            >
              {(projects.data ?? [])
                .filter((p) => !p.archivedAt || p.id === project)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>
          <input
            ref={titleField}
            aria-label="标题"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setProblem(null)
            }}
            className="mt-0.5 w-full rounded-lg bg-transparent py-0.5 text-lg font-semibold text-fg"
          />
        </div>

        <div>
          <label htmlFor="create-parent" className={label}>
            放在谁下面
          </label>
          <select
            id="create-parent"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className={`${field} mt-1.5`}
          >
            <option value="">不放在任何任务下</option>
            {parents.map((p) => (
              // Indented with figure spaces rather than nbsp: an <option>'s text is all a native
              // select will render, so the shape of the tree has to be in the text itself.
              <option key={p.id} value={p.id}>
                {' '.repeat((p.depth - 1) * 2)}
                {p.title}
              </option>
            ))}
          </select>
        </div>

        {/* The same five marker shapes the rows speak, named, as native radios: one tab stop and
            the arrow keys inside it, for free and correctly. */}
        <div role="radiogroup" aria-labelledby="create-status-label">
          <span id="create-status-label" className={label}>
            状态
          </span>
          <div className="mt-1.5 grid grid-cols-3 gap-1">
            {TASK_STATUSES.map((s) => (
              <label
                key={s}
                className="relative flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border-subtle py-1 pr-2 pl-1.5 text-sm text-fg-muted hover:bg-surface has-[:checked]:border-border-strong has-[:checked]:bg-surface has-[:checked]:font-semibold has-[:checked]:text-fg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
              >
                <input
                  type="radio"
                  name="create-status"
                  value={s}
                  checked={status === s}
                  onChange={() => setStatus(s)}
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
            截止
          </span>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {DAYS.map(([word, day]) => (
              <button
                key={word}
                type="button"
                aria-pressed={dueDay === day}
                onClick={() => setDueDay(day)}
                className={decision}
              >
                {word}截止
              </button>
            ))}
            <button type="button" onClick={() => setDueDay('')} className={decision}>
              取消截止
            </button>
          </div>
          {dueEcho && <p className="mt-1 text-xs tabular-nums text-fg-muted">{dueEcho}</p>}
        </div>

        <div>
          <span className="flex items-center gap-1 text-sm text-plan">
            <PlanMark />
            排期
          </span>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {DAYS.map(([word, day]) => (
              <button
                key={word}
                type="button"
                aria-pressed={scheduledOn === day}
                onClick={() => setScheduledOn(day)}
                className={decision}
              >
                排到{word}
              </button>
            ))}
            <button type="button" onClick={() => setScheduledOn('')} className={decision}>
              清除排期
            </button>
          </div>
          {planEcho && <p className="mt-1 text-xs tabular-nums text-fg-muted">{planEcho}</p>}
        </div>

        {/* `htmlFor` rather than a wrapping label, for the reason the detail pane records: React
            writes a textarea's value into the element's text, so a wrapping label's name would be
            「备注」 plus whatever had been typed. */}
        <div>
          <label htmlFor="create-notes" className={label}>
            备注
          </label>
          <textarea
            id="create-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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
            创建失败，内容仍留在这里，请重试
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
          <button
            type="submit"
            className="h-9 rounded-lg bg-accent px-3 font-semibold text-accent-fg hover:opacity-90"
          >
            创建
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-border-strong px-3 text-fg hover:bg-surface-hover"
          >
            取消
          </button>
          {/* Both chords, not one guessed from the user agent: the keys are what the hint is for,
              and a wrong guess teaches the wrong key. */}
          <p className="ml-auto text-xs text-fg-muted">
            <kbd className="rounded border border-border-strong px-1.5 text-xs leading-5">⌘↵</kbd> /{' '}
            <kbd className="rounded border border-border-strong px-1.5 text-xs leading-5">
              Ctrl↵
            </kbd>{' '}
            创建并接着建下一条
          </p>
        </div>
      </form>
    </Modal>
  )
}
