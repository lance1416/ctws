import { LINK } from '../../../platform/ui/buttonStyles'
import type { ProjectId } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { useId, useRef } from 'react'
import { BoardIcon, NewIcon, TreeIcon } from '../../../platform/ui/icons'
import { useLineEntry } from '../../../platform/ui/useLineEntry'
import { createTask, projectTasksQuery } from '../api'
import { TaskBoard } from './board/TaskBoard'
import { markStart, TREE_ROW } from './TaskRowParts'
import { TaskTree } from './TaskTree'

/** The two ways to look at a project's tasks (FR-053). The first is the default. */
export const PROJECT_VIEWS = [
  { id: 'tree', label: 'Tree', icon: TreeIcon },
  // The board takes the page's width: its columns are the view (artboard 21).
  { id: 'board', label: 'Board', icon: BoardIcon, wide: true },
] as const

/** The module's rows under a shell project: the tree, and the one input that adds a root task. */
export function ProjectTasks({ projectId, view }: { projectId: ProjectId; view: string }) {
  const title = useLineEntry()
  const box = useRef<HTMLInputElement>(null)
  const failureId = useId()
  const send = title.sends((text) => createTask({ projectId, title: text, parentId: null }))
  const create = useMutation({
    mutationFn: send,
    meta: { changes: ['task'], awaits: [projectTasksQuery(projectId).queryKey], ownsError: true },
  })

  const field = title.field({ onSubmit: create.mutate, busy: create.isPending })
  const invalid = create.isError ? true : undefined
  const describedBy = create.isError ? failureId : undefined
  // The typed title stays in the box after a failure.
  const failure = create.isError && (
    <p id={failureId} role="alert" className="flex items-center gap-2 text-ui text-stop-t">
      Couldn’t save. What you typed is still here.
      <button type="button" onClick={() => create.mutate(title.value.trim())} className={LINK}>
        Try again
      </button>
    </p>
  )

  // On the board it heads To do (FR-057); in the tree it is the last row.
  if (view === 'board')
    return (
      <TaskBoard
        key={projectId}
        projectId={projectId}
        add={
          <div className="flex flex-col gap-1">
            {/* Lined up with the cards under it: the plus where a card's status is, as wide, and
                the words where a card's title starts (a card's 1 of border and 10 inside). */}
            <label className="flex h-7.5 items-center gap-2 rounded-control px-[11px] text-subtle hover:bg-hover">
              <span aria-hidden="true" className="flex w-4 shrink-0 justify-center">
                <NewIcon size={14} />
              </span>
              <input
                ref={box}
                {...field}
                data-bare
                placeholder="New task"
                aria-label="New task"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                className="h-7 min-w-0 flex-1 bg-transparent text-ui text-ink placeholder:text-subtle"
              />
            </label>
            {failure}
          </div>
        }
      />
    )
  return (
    <TaskTree
      key={projectId}
      projectId={projectId}
      last={
        // "New task", typed into where it will land: no dialog (FR-054).
        <div data-new-root className={`${TREE_ROW} pb-1`}>
          <div
            style={{ paddingLeft: markStart(1) }}
            className="col-span-full flex min-w-0 flex-col justify-center"
          >
            <label className="flex min-h-9 items-center gap-1.5 text-muted">
              <NewIcon size={16} aria-hidden="true" className="shrink-0" />
              <input
                ref={box}
                {...field}
                data-bare
                placeholder="New task"
                aria-label="New task"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                className="ml-1 h-7 min-w-0 flex-1 bg-transparent text-ui text-ink placeholder:text-muted"
              />
            </label>
            {failure}
          </div>
        </div>
      }
    />
  )
}
