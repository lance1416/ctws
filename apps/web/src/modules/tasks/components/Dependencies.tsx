import type { DependencyRef } from '@ctws/contracts'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { ApiError } from '../../../platform/http/api'
import { searchTasks } from '../api/search'
import { addDependency, removeDependency, taskDependencies } from '../api/tasks'
import { tasksKey } from '../api/taskCache'
import { field, label } from '../../../platform/ui/formStyles'

/**
 * ONE TASK WAITING FOR ANOTHER, in the detail pane.
 *
 * BOTH DIRECTIONS, AND FINISHED BLOCKERS TOO. The row outside shows only what is still in the
 * way, because a row answers whether this can be worked on now. The pane shows the arrangement:
 * a blocker that is already finished is a fact about this task worth seeing, and it is also the
 * only way to find an edge in order to remove it.
 *
 * ADDING GOES THROUGH SEARCH, not a dropdown of every task in the workspace. A dependency
 * reaches across projects by design, so the candidate list is "everything", and a select of
 * everything is a list nobody can use. Search is the control this app already has for finding a
 * task by name.
 */

// `item`, not `ref`: React reserves that name in JSX, and a prop that only works by accident of
// the current version is not a prop.
function Row({
  item: task,
  here,
  onRemove,
}: {
  item: DependencyRef
  /** The project the OPEN task is in. */
  here: string
  onRemove?: () => void
}) {
  return (
    <li className="flex min-h-8 items-center gap-2 text-sm">
      <span className={`truncate ${task.done ? 'text-ink-subtle line-through' : 'text-ink'}`}>
        {task.title}
      </span>
      {/* The project only when it is a DIFFERENT one. Dependencies usually stay inside a project,
          and repeating the name of the project you are already looking at is the same noise the
          tree's rows leave out for the same reason. */}
      {task.projectId !== here && (
        <span className="truncate text-xs text-ink-subtle">{task.projectName}</span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove dependency “${task.title}”`}
          className="ml-auto h-7 w-7 shrink-0 rounded-md text-ink-subtle hover:bg-hover hover:text-ink"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="mx-auto h-3.5 w-3.5">
            <path
              d="M4 4l8 8M12 4l-8 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </li>
  )
}

/** One direction beside its list -- the label-then-value rhythm of Status, Due and Plan above. */
function Group({ tag, children }: { tag: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="w-8 shrink-0 pt-1.5 text-xs text-ink-subtle">{tag}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function Dependencies({ taskId, projectId }: { taskId: string; projectId: string }) {
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  const lists = useQuery({
    queryKey: ['dependencies', taskId],
    queryFn: () => taskDependencies(taskId),
  })
  const hits = useQuery({
    queryKey: ['search', query],
    queryFn: () => searchTasks(query),
    enabled: adding && query.trim().length > 0,
  })

  const awaits = [['dependencies', taskId], tasksKey(projectId), ['today']]
  const add = useMutation({
    mutationFn: (blockerId: string) => addDependency(taskId, blockerId),
    meta: { awaits },
    onSuccess: () => {
      setQuery('')
      setAdding(false)
      setError(null)
    },
    // Our own words, not the server's sentence: 409 is the one refusal a person can actually act
    // on, and "that would make two tasks wait for each other" is a developer's phrasing.
    onError: (e) =>
      setError(
        e instanceof ApiError && e.status === 409
          ? 'That would leave the two waiting on each other'
          : "Couldn't add that dependency",
      ),
  })
  const drop = useMutation({
    mutationFn: (blockerId: string) => removeDependency(taskId, blockerId),
    meta: { awaits },
  })

  const blockedBy = lists.data?.blockedBy ?? []
  const blocks = lists.data?.blocks ?? []
  // Never offer this task itself: it is the one edge the server refuses outright, and offering
  // it would be the interface proposing something it knows is impossible.
  const candidates = (hits.data ?? []).filter((t) => t.id !== taskId).slice(0, 6)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className={label}>Dependencies</span>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="-mx-1 rounded-md px-1 text-xs text-ink-muted hover:text-ink"
        >
          {adding ? 'Cancel' : 'Add'}
        </button>
      </div>

      {adding && (
        <div>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                setAdding(false)
              }
            }}
            placeholder="Search for a task to wait on"
            aria-label="Search for a task to wait on"
            className={`${field} text-sm`}
          />
          <ul data-dep-candidates className="mt-1 flex flex-col">
            {candidates.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => add.mutate(t.id)}
                  className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-hover"
                >
                  <span className="truncate text-ink">{t.title}</span>
                  <span className="ml-auto shrink-0 text-xs text-ink-subtle">{t.projectName}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {blockedBy.length > 0 && (
        <Group tag="Waits on">
          <ul data-blocked-by className="flex flex-col">
            {blockedBy.map((t) => (
              <Row key={t.id} item={t} here={projectId} onRemove={() => drop.mutate(t.id)} />
            ))}
          </ul>
        </Group>
      )}

      {blocks.length > 0 && (
        <Group tag="Blocks">
          {/* No remove button on this side: the edge belongs to the OTHER task's "waiting for"
              list, and removing it from here would be editing a task that is not open. */}
          <ul data-blocks className="flex flex-col">
            {blocks.map((t) => (
              <Row key={t.id} item={t} here={projectId} />
            ))}
          </ul>
        </Group>
      )}

      {!adding && blockedBy.length === 0 && blocks.length === 0 && (
        <p className="text-sm text-ink-subtle">None</p>
      )}
    </div>
  )
}
