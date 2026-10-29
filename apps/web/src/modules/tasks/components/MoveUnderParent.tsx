import { MAX_TASK_DEPTH, type ProjectId, type TaskId } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { useComposing } from '../../../platform/keyboard/composition'
import { ICON_BUTTON, KEY } from '../../../platform/ui/buttonStyles'
import { BackIcon, CloseIcon } from '../../../platform/ui/icons'
import { SkeletonRows } from '../../../platform/ui/Block'
import { projectTasksQuery } from '../api'
import { ancestorsOf } from '../logic/tree/ancestors'
import { flatten } from '../logic/tree/flatten'
import { leafCounts } from '../logic/tree/leafCounts'
import { ProgressSquare } from './ProgressSquare'

/** Each level of the tree, further in. */
const LEVEL = 16

/**
 * MOVE TO…'S SECOND STEP (FR-059): the parents of the project gone into, in the tree's order and
 * indent, each with its progress; no leaves, and no "Top of" row, which the first step already
 * is. Words typed filter them flat, each with the parent above it. A parent the moved task's tree
 * would sink past MAX_TASK_DEPTH under is not offered. "‹" or ← goes back to the projects.
 */
export function MoveUnderParent({
  project,
  height,
  moving = null,
  busy,
  error,
  onPick,
  back,
  close,
}: {
  project: { id: ProjectId; name: string }
  /** How many levels the moved task and what is under it take. */
  height: number
  moving?: TaskId | null
  busy: boolean
  error: string | null
  onPick: (parent: { id: TaskId; title: string }) => void
  back: () => void
  close: () => void
}) {
  const tasks = useQuery(projectTasksQuery(project.id))
  const composing = useComposing()
  const [query, setQuery] = useState('')
  const [at, setAt] = useState(0)
  const box = useRef<HTMLInputElement>(null)
  const base = useId()
  const optionId = (i: number) => `${base}-option-${i}`
  // The step takes the place of the box focus was in.
  useEffect(() => box.current?.focus(), [])

  const all = tasks.data?.tasks ?? []
  const byId = new Map(all.map((t) => [t.id, t]))
  const counts = leafCounts(all)
  const typed = query.trim().toLocaleLowerCase()
  // Under itself, or under its own: the tree would close on itself.
  const inside = (id: TaskId) =>
    id === moving || (moving !== null && ancestorsOf(all, id).includes(moving))
  const rows = flatten(all, new Set())
    .filter((r) => r.hasChildren && r.depth + height <= MAX_TASK_DEPTH && !inside(r.id))
    .filter((r) => typed === '' || byId.get(r.id)!.title.toLocaleLowerCase().includes(typed))
  const active = Math.min(at, Math.max(rows.length - 1, 0))
  const pick = (id: TaskId) => {
    if (!busy) onPick({ id, title: byId.get(id)!.title })
  }

  return (
    <>
      <div className="flex h-11 items-center gap-1 border-b border-line pr-4 pl-2">
        {/* A phone's full screen shuts here, the way back beside it (DES-001 "从底部弹出的面板"). */}
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className={`${ICON_BUTTON} size-11 lg:hidden`}
        >
          <CloseIcon size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={back}
          title="Back  ←"
          className="flex max-w-[45%] shrink-0 items-center gap-1 rounded-control px-1.5 py-1 text-ui text-muted hover:bg-hover hover:text-ink max-lg:tap"
        >
          <BackIcon size={16} aria-hidden="true" className="shrink-0" />
          <span className="truncate">{project.name}</span>
        </button>
        <input
          ref={box}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setAt(0)
          }}
          role="combobox"
          aria-expanded={rows.length > 0}
          aria-controls={`${base}-results`}
          aria-autocomplete="list"
          aria-activedescendant={rows.length > 0 ? optionId(active) : undefined}
          {...composing.bind}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setAt(Math.min(active + 1, rows.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setAt(Math.max(active - 1, 0))
            } else if (e.key === 'Enter' && !composing.composingNow(e)) {
              e.preventDefault()
              const row = rows[active]
              if (row) pick(row.id)
            } else if (e.key === 'ArrowLeft' && e.currentTarget.selectionEnd === 0) {
              e.preventDefault()
              back()
            }
          }}
          placeholder="Filter parents"
          aria-label={`Parents in ${project.name}`}
          data-bare
          className="h-9 min-w-0 flex-1 bg-transparent text-ui text-ink placeholder:text-subtle max-lg:h-11"
        />
      </div>
      {tasks.isPending ? (
        <div className="px-1 py-1.5" aria-hidden="true">
          <SkeletonRows rows={3} />
        </div>
      ) : tasks.isError ? (
        <p role="alert" className="px-4 py-3 text-ui text-stop-t">
          Couldn’t load its tasks. Try again.
        </p>
      ) : rows.length === 0 && typed !== '' ? (
        <p className="px-4 py-3 text-ui text-ink">No parents match “{query.trim()}”.</p>
      ) : null}
      <ul
        id={`${base}-results`}
        role="listbox"
        aria-label={`Parents in ${project.name}`}
        className="max-h-[52vh] overflow-y-auto pb-1.5 max-lg:max-h-none max-lg:min-h-0 max-lg:flex-1"
      >
        {rows.map((row, i) => {
          const task = byId.get(row.id)!
          const above = task.parentId ? byId.get(task.parentId) : undefined
          return (
            <li
              key={row.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              data-move-parent={row.id}
              onClick={() => pick(row.id)}
              onMouseEnter={() => setAt(i)}
              style={{ paddingLeft: 16 + (typed === '' ? (row.depth - 1) * LEVEL : 0) }}
              className={`flex min-h-10 cursor-pointer items-center gap-3 pr-4 text-ui text-ink max-lg:min-h-11 ${
                i === active ? 'bg-select' : ''
              }`}
            >
              <span aria-hidden="true" className="flex shrink-0">
                <ProgressSquare status={task.status} children={counts.get(row.id)!} />
              </span>
              <span className="min-w-0 truncate">{task.title}</span>
              {typed !== '' && above && (
                <span className="min-w-0 flex-1 truncate text-right text-meta text-subtle">
                  {above.title}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {error ? (
        <p role="alert" className="border-t border-line px-3.5 py-2.5 text-ui text-stop-t">
          {error}
        </p>
      ) : (
        <div className="flex h-10 items-center gap-4 border-t border-line px-4 text-meta text-subtle max-lg:hidden">
          {rows.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <kbd className={KEY}>Enter</kbd>Choose
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <kbd className={KEY}>←</kbd>Back
          </span>
        </div>
      )}
    </>
  )
}
