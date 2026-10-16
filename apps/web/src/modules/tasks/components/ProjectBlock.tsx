import type { ProjectId } from '@ctws/contracts'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Fragment, useId, useRef, useState, type ReactNode } from 'react'
import { useDocumentKeys } from '../../../platform/keyboard/keyTable'
import { dayPhrase, ymd } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { textbox } from '../../../platform/ui/formStyles'
import { useLineEntry } from '../../../platform/ui/useLineEntry'
import { useTimeZone } from '../../../shell/auth'
import { createTask, movementQuery, projectTasksQuery } from '../api'
import { PROJECT_PAGE_KEYS } from '../logic/keys'
import { CreateTaskDialog } from './CreateTaskDialog'
import { TaskBoard } from './TaskBoard'
import { TaskTree } from './TaskTree'

/**
 * "6 open, 1 overdue, 63% done. Last moved today." The percentage is the mean of the root tasks'
 * rollups, left out when nothing is scored or nothing is done.
 */
export function ProjectNumbers({ projectId }: { projectId: ProjectId }) {
  const movement = useQuery(movementQuery())
  const timeZone = useTimeZone()
  const row = movement.data?.find((r) => r.projectId === projectId)
  const tasks = useQuery(projectTasksQuery(projectId))
  const progress = (() => {
    const data = tasks.data
    if (!data) return null
    const roots = data.tasks.filter((t) => t.parentId === null)
    const scored = roots.map((t) => data.rollups[t.id]?.progress).filter((p) => p != null)
    if (scored.length === 0) return null
    return scored.reduce((a, b) => a + b, 0) / scored.length
  })()
  const now = useNow()
  // Nothing while in flight, nor for an archived project, which the movement query leaves out.
  if (!row) return null
  const today = ymd(now, timeZone)
  const moved = row.lastActivityOn ? dayPhrase(row.lastActivityOn, today) : null
  // Overdue only when there is any, in the miss colour.
  const parts: ReactNode[] = [`${row.remaining} open`]
  if (row.overdue > 0) parts.push(<span className="text-missed">{row.overdue} overdue</span>)
  // 0% is no more news than "0 overdue": a line with nothing done yet says how much is open.
  if (progress !== null && Math.round(progress * 100) > 0)
    parts.push(`${Math.round(progress * 100)}% done`)
  return (
    <p data-project-sentence className="mt-1.5 text-ink-muted tabular-nums">
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && ', '}
          {p}
        </Fragment>
      ))}
      .{' '}
      {moved
        ? `Last moved ${/^(Today|Yesterday)$/.test(moved) ? moved.toLowerCase() : moved}.`
        : 'Nothing has moved yet.'}
    </p>
  )
}

/** The two ways to look at the same rows. The first is the default. */
export const PROJECT_VIEWS = [
  { id: 'list', label: 'List' },
  { id: 'board', label: 'Board' },
] as const

/**
 * The task block's New button. It carries the `n` key, which needs a project to create into, under
 * the guards every single key obeys.
 */
export function NewTaskAction({ projectId }: { projectId: ProjectId }) {
  const [creating, setCreating] = useState(false)
  useDocumentKeys(PROJECT_PAGE_KEYS, { create: () => setCreating(true) })

  return (
    <>
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm text-ink-muted hover:bg-hover hover:text-ink"
      >
        New…
        <kbd
          aria-hidden="true"
          className="pointer-events-none rounded border border-rule px-1.5 text-xs leading-5 text-ink-subtle max-sm:hidden"
        >
          n
        </kbd>
      </button>
      {creating && <CreateTaskDialog projectId={projectId} onClose={() => setCreating(false)} />}
    </>
  )
}

/** The module's rows under a shell project: the tree, and the one input that adds a root task. */
export function ProjectTasks({ projectId, view }: { projectId: ProjectId; view: string }) {
  const title = useLineEntry()
  const box = useRef<HTMLInputElement>(null)
  const failureId = useId()
  const send = title.sends((text) => createTask({ projectId, title: text, parentId: null }))
  const create = useMutation({
    mutationFn: send,
    meta: { awaits: [projectTasksQuery(projectId).queryKey], ownsError: true },
  })

  return (
    <>
      {/* A line and Enter, inset to where the rows' bodies start. */}
      <div className="mb-1 ml-[71px] flex max-w-[52ch] flex-wrap items-center gap-2 pr-2 sm:ml-[89px]">
        <input
          ref={box}
          {...title.field({ onSubmit: create.mutate, busy: create.isPending })}
          placeholder="New task"
          aria-label="New task"
          aria-invalid={create.isError ? true : undefined}
          aria-describedby={create.isError ? failureId : undefined}
          // The border follows `aria-invalid` (see `textbox`), so colour and announced state agree.
          className={`min-w-0 flex-1 basis-[22ch] bg-sheet ${textbox}`}
        />
      </div>
      {/* The typed title stays in the box after a failure. */}
      {create.isError && (
        <p id={failureId} role="alert" className="mt-1 ml-[71px] text-sm text-danger sm:ml-[89px]">
          Couldn't create. Press Enter to try again.
        </p>
      )}
      {/* The board is a view of this block, so the box above stays either way. */}
      {view === 'board' ? (
        <TaskBoard key={projectId} projectId={projectId} />
      ) : (
        <TaskTree key={projectId} projectId={projectId} addFirst={() => box.current?.focus()} />
      )}
    </>
  )
}
