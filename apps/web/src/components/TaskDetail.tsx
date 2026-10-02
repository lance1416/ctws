import {
  TASK_STATUSES,
  type TaskResponse,
  type TaskStatus,
  type UpdateTaskBody,
} from '@ctws/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { listProjects } from '../api/projects'
import { moveTask, patchTask } from '../api/tasks'

// An empty date input yields '' , and the contract takes a date or null. Sending '' would be
// rejected; silently coercing it to today would be worse.
export const orNull = (v: string) => (v.trim() === '' ? null : v)

const STATUS_LABEL: Record<TaskStatus, string> = {
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

const field = 'mt-1 w-full rounded border border-border-strong bg-surface px-3 py-2 text-fg'

type Props = { task: TaskResponse; projectId: string; onClose: () => void }

export function TaskDetail({ task, projectId, onClose }: Props) {
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
      await qc.invalidateQueries({ queryKey: ['tasks', projectId] })
      if (nextProjectId !== projectId)
        await qc.invalidateQueries({ queryKey: ['tasks', nextProjectId] })
    },
  })

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }

  return (
    <div
      ref={panel}
      tabIndex={-1}
      role="dialog"
      aria-label="任务详情"
      onKeyDown={onKeyDown}
      className="fixed inset-y-0 focus:outline-none right-0 z-10 w-full max-w-md overflow-y-auto border-l border-border-subtle bg-surface-raised p-4 text-fg"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (title.trim() && !save.isPending) save.mutate()
        }}
        className="flex flex-col gap-3"
      >
        <label>
          标题
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
        </label>
        <label>
          备注
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            className={field}
          />
        </label>
        <label>
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
        <label>
          排期
          <input
            type="date"
            value={scheduledOn}
            onChange={(e) => setScheduledOn(e.target.value)}
            className={field}
          />
        </label>
        <label>
          截止
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className={field}
          />
        </label>
        <label>
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
        {save.isError && (
          <p role="alert" className="text-danger">
            {save.error instanceof Error ? save.error.message : '保存失败'}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={save.isPending || !title.trim()}
            className="rounded bg-accent px-3 py-2 text-accent-fg disabled:opacity-50"
          >
            保存
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border-strong px-3 py-2"
          >
            关闭
          </button>
        </div>
      </form>
    </div>
  )
}
