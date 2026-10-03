import {
  TASK_STATUSES,
  type TaskResponse,
  type TaskStatus,
  type UpdateTaskBody,
} from '@ctws/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { listProjects } from '../api/projects'
import { moveTask, patchTask } from '../api/tasks'
import { tasksKey } from '../api/taskCache'

// An empty date input yields '' , and the contract takes a date or null. Sending '' would be
// rejected; silently coercing it to today would be worse.
export const orNull = (v: string) => (v.trim() === '' ? null : v)

export const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: '待整理',
  todo: '待办',
  in_progress: '进行中',
  done: '已完成',
  cancelled: '已取消',
}

const pad = (n: number) => String(n).padStart(2, '0')

/** An instant as the local "YYYY-MM-DDTHH:mm" a datetime-local input shows; '' when absent. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** The inverse: a local datetime-local value as the instant (with offset) the contract takes. */
export function fromLocalInput(v: string): string | null {
  const s = orNull(v)
  return s === null ? null : new Date(s).toISOString()
}

const field =
  'mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-fg leading-snug'
const label = 'block text-sm text-fg-muted'

type Props = {
  task: TaskResponse
  projectId: string
  /** Dismissed without saving (and with nothing to lose, or after the user chose to discard). */
  onClose: () => void
  /** The save was accepted by the server; the owner closes the panel and acknowledges it. */
  onSaved: () => void
}

const TABBABLE = 'input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"])'

export function TaskDetail({ task, projectId, onClose, onSaved }: Props) {
  const qc = useQueryClient()
  const panel = useRef<HTMLDivElement>(null)
  // The panel is last in the DOM, so without this a keyboard user would tab past every row to
  // reach it. Escape also only works while focus is inside.
  useEffect(() => panel.current?.focus(), [])
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes ?? '')
  const [status, setStatus] = useState<TaskStatus>(task.status)
  const [scheduledOn, setScheduledOn] = useState(task.scheduledOn ?? '')
  const [dueAt, setDueAt] = useState(toLocalInput(task.dueAt))
  const [nextProjectId, setNextProjectId] = useState(task.projectId)

  // What the form started from, fixed at mount: a background refetch of `task` must not make an
  // untouched form look edited (or an edited one look clean).
  const initial = useRef({
    title: task.title,
    notes: task.notes ?? '',
    status: task.status,
    scheduledOn: task.scheduledOn ?? '',
    dueAt: toLocalInput(task.dueAt),
    projectId: task.projectId,
  })
  const dirty =
    title !== initial.current.title ||
    notes !== initial.current.notes ||
    status !== initial.current.status ||
    scheduledOn !== initial.current.scheduledOn ||
    dueAt !== initial.current.dueAt ||
    nextProjectId !== initial.current.projectId
  // Closing with unsaved edits asks first, in the panel: a browser confirm() would block the
  // automation this app is tested with, and the typing would be lost without a word otherwise.
  const [askDiscard, setAskDiscard] = useState(false)
  const keepEditing = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (askDiscard) keepEditing.current?.focus()
  }, [askDiscard])
  const requestClose = () => (dirty ? setAskDiscard(true) : onClose())

  // The panel starts below the sticky top bar rather than over it, so the capture box and the
  // account controls stay visible and usable while a task is open.
  const [top, setTop] = useState(0)
  useLayoutEffect(() => {
    const measure = () =>
      setTop(document.querySelector('header')?.getBoundingClientRect().bottom ?? 0)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const save = useMutation({
    mutationFn: async () => {
      // Only what changed: an untouched due time must not be rewritten at minute precision.
      const patch: UpdateTaskBody = {}
      if (title.trim() !== task.title) patch.title = title.trim()
      if (orNull(notes) !== (task.notes ?? null)) patch.notes = orNull(notes)
      if (status !== task.status) patch.status = status
      if (orNull(scheduledOn) !== task.scheduledOn) patch.scheduledOn = orNull(scheduledOn)
      if (dueAt !== toLocalInput(task.dueAt)) patch.dueAt = fromLocalInput(dueAt)
      if (Object.keys(patch).length > 0) await patchTask(task.id, patch)
      if (nextProjectId !== task.projectId) {
        // Crossing projects is a structural change: `move` cascades project_id to the subtree and
        // enforces the invariants. A PATCH would not. parentId resets to null because the old
        // parent does not exist in the destination.
        await moveTask(task.id, { projectId: nextProjectId, parentId: null })
      }
    },
    // Settled, not success: if the move fails after the patch landed, the list is still stale.
    onSettled: async () => {
      // The today list is cross-project and server-derived: any edit can move a task between
      // segments or off the list, so it is always refetched.
      await qc.invalidateQueries({ queryKey: ['today'] })
      await qc.invalidateQueries({ queryKey: tasksKey(projectId) })
      if (nextProjectId !== projectId)
        await qc.invalidateQueries({ queryKey: tasksKey(nextProjectId) })
    },
  })

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      // A second Escape on the discard prompt means "keep editing".
      if (askDiscard) setAskDiscard(false)
      else requestClose()
    } else if (e.key === 'Tab') {
      // Trap: Tab cycles inside the panel. Left alone it would walk on into whatever the panel
      // is covering, which is invisible to the person pressing the key.
      const items = [...(panel.current?.querySelectorAll<HTMLElement>(TABBABLE) ?? [])].filter(
        (el) => !el.hasAttribute('disabled'),
      )
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return e.preventDefault()
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === panel.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  return (
    <>
      {/* Click-outside: an invisible layer over the page (below the top bar) that closes the panel. */}
      <div
        aria-hidden="true"
        data-detail-backdrop
        onClick={requestClose}
        style={{ top }}
        className="fixed inset-x-0 bottom-0 z-20"
      />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-label="任务详情"
        onKeyDown={onKeyDown}
        style={{ top }}
        className="fixed bottom-0 right-0 z-20 w-full max-w-md overflow-y-auto border-l border-border-subtle bg-surface-raised p-5 text-fg focus:outline-none"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            // After the lists have refetched, so the row behind the panel is already up to date.
            if (title.trim() && !save.isPending) save.mutate(undefined, { onSuccess: onSaved })
          }}
          className="flex flex-col gap-4"
        >
          <label className={label}>
            标题
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
          </label>
          <label className={label}>
            备注
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              className={field}
            />
          </label>
          <label className={label}>
            状态
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className={field}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            排期
            <input
              type="date"
              value={scheduledOn}
              onChange={(e) => setScheduledOn(e.target.value)}
              className={field}
            />
          </label>
          <label className={label}>
            截止
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className={field}
            />
          </label>
          <label className={label}>
            项目
            <select
              value={nextProjectId}
              onChange={(e) => setNextProjectId(e.target.value)}
              className={field}
            >
              {(projects.data ?? [])
                .filter((p) => !p.archivedAt || p.id === task.projectId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          {askDiscard && (
            <div role="alert" className="rounded-md border border-border-strong p-3 text-sm">
              <p className="text-fg">有未保存的修改，关闭会丢掉它们。</p>
              <div className="mt-2 flex gap-2">
                <button
                  ref={keepEditing}
                  type="button"
                  onClick={() => setAskDiscard(false)}
                  className="h-9 rounded-md bg-accent px-3 font-medium text-accent-fg hover:opacity-90"
                >
                  继续编辑
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 rounded-md border border-border-strong px-3 text-fg hover:bg-surface-sunken"
                >
                  放弃修改
                </button>
              </div>
            </div>
          )}
          {save.isError && (
            <p role="alert" className="text-sm text-danger">
              {save.error instanceof Error ? save.error.message : '保存失败'}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={save.isPending || !title.trim()}
              className="h-10 rounded-md bg-accent px-4 font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
            >
              保存
            </button>
            <button
              type="button"
              onClick={requestClose}
              className="h-10 rounded-md border border-border-strong px-4 text-fg hover:bg-surface-sunken"
            >
              关闭
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
