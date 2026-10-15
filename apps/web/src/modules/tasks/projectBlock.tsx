import { useMutation, useQuery } from '@tanstack/react-query'
import { Fragment, useEffect, useId, useState, type ReactNode } from 'react'
import { isOverlayOpen } from '../../platform/keyboard/overlayState'
import { useShortcutsEnabled } from '../../platform/keyboard/enabled'
import { isBareKey, isTypingTarget } from '../../platform/keyboard/keys'
import { dayPhrase, todayIn } from '../../platform/time/dates'
import { useNow } from '../../platform/time/useNow'
import { textbox } from '../../platform/ui/formStyles'
import { useInlineEdit } from '../../platform/ui/useInlineEdit'
import { useTimeZone } from '../../shell/auth/useMe'
import { movementQuery, projectTasksQuery } from './api/queries'
import { createTask } from './api/tasks'
import { CreateTaskDialog } from './components/CreateTaskDialog'
import { TaskBoard } from './components/TaskBoard'
import { TaskTree } from './components/TaskTree'

/** What the tasks module hangs on a project page: its numbers, its rows, and its New. */

/**
 * THE PROJECT'S NUMBERS under its name, as one sentence: "6 open, 1 overdue, 63% done. Last moved
 * today." Open, overdue and the last move are the server's (`movementQuery`, in the account's
 * zone); the percentage is the mean of the root tasks' rollups -- the rule a parent gets -- and is
 * left out when nothing is scored or nothing is done. No bar: two 60% lines look alike, and "Last
 * moved" is what tells them apart.
 */
export function ProjectNumbers({ projectId }: { projectId: string }) {
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
  // Nothing while in flight, and nothing for an archived project, which the movement query leaves
  // out rather than calling it quiet.
  if (!row) return null
  const today = todayIn(timeZone, now)
  const moved = row.lastActivityOn ? dayPhrase(row.lastActivityOn, today) : null
  // Overdue only when there is any, in the miss colour -- the one number allowed a hue.
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
 * THE TASK BLOCK'S OWN NEW BUTTON, in the block's head. It carries the `n` key, which lives here
 * rather than in the shell's table because it needs a project to create into; it obeys the guards
 * every single key obeys -- the off switch, not while typing, not under an open layer.
 */
export function NewTaskAction({ projectId }: { projectId: string }) {
  const [creating, setCreating] = useState(false)
  const shortcuts = useShortcutsEnabled()

  useEffect(() => {
    if (!shortcuts) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'n' || !isBareKey(e)) return
      if (isTypingTarget(e.target) || isOverlayOpen()) return
      e.preventDefault()
      setCreating(true)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [shortcuts])

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
export function ProjectTasks({ projectId, view }: { projectId: string; view: string }) {
  const [title, setTitle] = useState('')
  const failureId = useId()
  const create = useMutation({
    mutationFn: (t: string) => createTask({ projectId, title: t, parentId: null }),
    meta: { awaits: [projectTasksQuery(projectId).queryKey] },
    onSuccess: () => setTitle(''),
  })

  const submit = () => {
    const t = title.trim()
    if (t && !create.isPending) create.mutate(t)
  }
  const titleKeys = useInlineEdit({ onCommit: submit })

  return (
    <>
      {/* THE FAST PATH: a line and Enter. The full form is the block's own New, in its head.
          Inset to where the rows' bodies start (margin, thread, gutter), so the box reads as the
          first row's place. */}
      <div className="mb-1 ml-[71px] flex max-w-[52ch] flex-wrap items-center gap-2 pr-2 sm:ml-[89px]">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          {...titleKeys}
          placeholder="New task"
          aria-label="New task"
          aria-invalid={create.isError ? true : undefined}
          aria-describedby={create.isError ? failureId : undefined}
          // Inside the panel now, so it leads the rows rather than hanging under a page heading.
          // The border follows `aria-invalid` (see `textbox`), so the colour and the state the
          // screen reader is told cannot disagree.
          className={`min-w-0 flex-1 basis-[22ch] bg-sheet ${textbox}`}
        />
      </div>
      {/* THE FAILURE SITS UNDER ITS OWN BOX, inside the same block and at the same left
          edge, rather than as a line of page chrome below the whole control group. The typed
          title is still in the box: what was typed is the user's, not the request's. */}
      {create.isError && (
        <p id={failureId} role="alert" className="mt-1 ml-[71px] text-sm text-danger sm:ml-[89px]">
          Couldn't create. Press Enter to try again.
        </p>
      )}
      {/* The board is a VIEW of this block, not a page: the one-line box above stays, because
          capturing into this project is the same action whichever way the rows are drawn. */}
      {view === 'board' ? (
        <TaskBoard key={projectId} projectId={projectId} />
      ) : (
        <TaskTree key={projectId} projectId={projectId} />
      )}
    </>
  )
}
