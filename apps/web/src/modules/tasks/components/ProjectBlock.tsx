import { LINK } from '../../../platform/ui/buttonStyles'
import type { ProjectId } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { useId, useRef } from 'react'
import { textbox } from '../../../platform/ui/formStyles'
import { BoardIcon, NewIcon, TreeIcon } from '../../../platform/ui/icons'
import { useLineEntry } from '../../../platform/ui/useLineEntry'
import { createTask, projectTasksQuery } from '../api'
import { TaskBoard } from './TaskBoard'
import { markStart, TREE_ROW } from './TaskRowParts'
import { TaskTree } from './TaskTree'
import { BODY_START } from '../../../shell/rows'

/** The two ways to look at a project's tasks (FR-053). The first is the default. */
export const PROJECT_VIEWS = [
  { id: 'tree', label: 'Tree', icon: TreeIcon },
  { id: 'board', label: 'Board', icon: BoardIcon },
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

  // The board has a line and Enter above its columns; the tree has it as its last row.
  if (view === 'board')
    return (
      <>
        <div className={`mb-1 flex max-w-[52ch] flex-col gap-1 pr-2 ${BODY_START}`}>
          <input
            ref={box}
            {...field}
            placeholder="New task"
            aria-label="New task"
            aria-invalid={invalid}
            aria-describedby={describedBy}
            // The border follows `aria-invalid` (see `textbox`), so colour and announced state agree.
            className={`min-w-0 bg-panel ${textbox}`}
          />
          {failure}
        </div>
        <TaskBoard key={projectId} projectId={projectId} />
      </>
    )
  return (
    <TaskTree
      key={projectId}
      projectId={projectId}
      addFirst={() => box.current?.focus()}
      last={
        // "New task", typed into where it will land: no dialog (FR-054).
        <div data-new-root className={`${TREE_ROW} pb-1`}>
          <div
            style={{ paddingLeft: markStart(1) }}
            className="col-span-4 flex min-w-0 flex-col justify-center"
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
