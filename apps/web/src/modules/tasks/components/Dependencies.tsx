import type { DependencyRef } from '@ctws/contracts'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { ApiError } from '../../../platform/http/api'
import { addDependency, removeDependency } from '../api/tasks'
import { dependenciesQuery, taskSearchQuery } from '../api/queries'
import { field, label } from '../../../platform/ui/formStyles'
import { CloseIcon } from '../../../platform/ui/icons'

// The pane shows both directions and finished blockers too, the only place to remove such an
// edge. Adding goes through search: a dependency can reach any task in any project.

// `item`, not `ref`: React reserves that name in JSX.
function Row({
  item: task,
  here,
  onRemove,
}: {
  item: DependencyRef
  /** The project the open task is in. */
  here: string
  onRemove?: () => void
}) {
  return (
    <li className="flex min-h-8 items-center gap-2 text-sm">
      <span className={`truncate ${task.done ? 'text-ink-subtle line-through' : 'text-ink'}`}>
        {task.title}
      </span>
      {/* The project only when it is not the open task's. */}
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
          <CloseIcon className="mx-auto h-3.5 w-3.5" strokeWidth={1.5} />
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

  const lists = useQuery(dependenciesQuery(taskId))
  const hits = useQuery({
    ...taskSearchQuery(query),
    enabled: adding && query.trim().length > 0,
  })

  const awaits = [dependenciesQuery(taskId).queryKey]
  const add = useMutation({
    mutationFn: (blockerId: string) => addDependency(taskId, blockerId),
    meta: { awaits },
    onSuccess: () => {
      setQuery('')
      setAdding(false)
      setError(null)
    },
    // Our own words for a 409, the one refusal a person can act on.
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
    onSuccess: () => setError(null),
    onError: () => setError("Couldn't remove that dependency"),
  })

  const blockedBy = lists.data?.blockedBy ?? []
  const blocks = lists.data?.blocks ?? []
  // Never offer this task itself: the server refuses that edge outright.
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
          {/* No remove on this side: the edge belongs to the other task, which is not open. */}
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
