import {
  idFrom,
  taskId as taskIdSchema,
  type DependencyRef,
  type ProjectId,
  type TaskId,
} from '@ctws/contracts'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError } from '../../../platform/http/api'
import { CloseIcon, LockIcon } from '../../../platform/ui/icons'
import { PickThing } from '../../../shell/search'
import { addDependency, dependenciesQuery, removeDependency } from '../api'
import { Field } from './InspectorField'

// Both directions, finished blockers too, the only place to remove such an edge. Adding goes
// through search: a dependency can reach any task in any project.

// `item`, not `ref`: React reserves that name in JSX.
function Row({
  item: task,
  here,
  onRemove,
}: {
  item: DependencyRef
  /** The project the open task is in. */
  here: string
  onRemove?: (() => void) | undefined
}) {
  return (
    <li className="flex min-h-8 min-w-0 items-center gap-2 text-ui">
      <span className={`truncate ${task.done ? 'text-subtle line-through' : 'text-ink'}`}>
        {task.title}
      </span>
      {/* The project only when it is not the open task's. */}
      {task.projectId !== here && (
        <span className="truncate text-meta text-subtle">{task.projectName}</span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove dependency “${task.title}”`}
          className="ml-auto grid size-7 shrink-0 place-items-center rounded-control text-subtle hover:bg-hover hover:text-ink"
        >
          <CloseIcon size={14} aria-hidden="true" />
        </button>
      )}
    </li>
  )
}

/**
 * WHAT IT WAITS ON AND HOLDS UP, as the inspector's field rows (FR-056, artboard 8): "Waiting on"
 * and "Blocks" beside Status and Due, behind a lock, each only when there is one. Editing, Waiting
 * on is always there, to add to and take from; each change is written the moment it is made.
 * Blocks is the other task's to change.
 */
export function DependencyRows({
  taskId,
  title,
  projectId,
  editing,
}: {
  taskId: TaskId
  /** The task's own, for the picker's head. */
  title: string
  projectId: ProjectId
  editing: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lists = useQuery(dependenciesQuery(taskId))

  const awaits = [dependenciesQuery(taskId).queryKey]
  const add = useMutation({
    mutationFn: (blockerId: TaskId) => addDependency(taskId, blockerId),
    meta: { changes: ['task'], awaits, ownsError: true },
    onSuccess: () => {
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
    mutationFn: (blockerId: TaskId) => removeDependency(taskId, blockerId),
    meta: { changes: ['task'], awaits, ownsError: true },
    onSuccess: () => setError(null),
    onError: () => setError("Couldn't remove that dependency"),
  })

  const blockedBy = lists.data?.blockedBy ?? []
  const blocks = lists.data?.blocks ?? []
  const lock = <LockIcon size={16} aria-hidden="true" />

  return (
    <>
      {(editing || blockedBy.length > 0) && (
        <Field icon={lock} name="Waiting on" top>
          <div className="flex min-w-0 flex-1 flex-col">
            {blockedBy.length > 0 && (
              <ul data-blocked-by className="flex flex-col">
                {blockedBy.map((t) => (
                  <Row
                    key={t.id}
                    item={t}
                    here={projectId}
                    onRemove={editing ? () => drop.mutate(t.id) : undefined}
                  />
                ))}
              </ul>
            )}
            {editing && (
              <button
                type="button"
                onClick={() => {
                  add.reset()
                  setError(null)
                  setAdding(true)
                }}
                className="-mx-1.5 h-8 self-start rounded-control px-1.5 text-ui text-muted hover:bg-hover hover:text-ink max-lg:tap"
              >
                Add
              </button>
            )}
            {/* The search box with its keys (FR-024), tasks only, never this one: the server
                refuses a task waiting on itself outright, nor what it already waits on. */}
            {adding && (
              <PickThing
                of={{ type: 'task', id: taskId }}
                title={`“${title}” waits on`}
                only="task"
                leaveOut={[taskId, ...blockedBy.map((t) => t.id)]}
                busy={add.isPending}
                error={error}
                onPick={(t) => add.mutate(idFrom(taskIdSchema, t.id))}
                onClose={() => setAdding(false)}
              />
            )}
            {error && !adding && (
              <p role="alert" className="text-ui text-stop-t">
                {error}
              </p>
            )}
          </div>
        </Field>
      )}
      {blocks.length > 0 && (
        <Field icon={lock} name="Blocks" top>
          {/* No remove on this side: the edge belongs to the other task, which is not open. */}
          <ul data-blocks className="flex min-w-0 flex-1 flex-col">
            {blocks.map((t) => (
              <Row key={t.id} item={t} here={projectId} />
            ))}
          </ul>
        </Field>
      )}
    </>
  )
}
