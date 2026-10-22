import { LINK } from '../../../platform/ui/buttonStyles'
import type { ProjectId } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { useId, useRef } from 'react'
import { textbox } from '../../../platform/ui/formStyles'
import { BoardIcon, TreeIcon } from '../../../platform/ui/icons'
import { useLineEntry } from '../../../platform/ui/useLineEntry'
import { createTask, projectTasksQuery } from '../api'
import { TaskBoard } from './TaskBoard'
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

  return (
    <>
      {/* A line and Enter, inset to where the rows' bodies start. */}
      <div className={`mb-1 flex max-w-[52ch] flex-wrap items-center gap-2 pr-2 ${BODY_START}`}>
        <input
          ref={box}
          {...title.field({ onSubmit: create.mutate, busy: create.isPending })}
          placeholder="New task"
          aria-label="New task"
          aria-invalid={create.isError ? true : undefined}
          aria-describedby={create.isError ? failureId : undefined}
          // The border follows `aria-invalid` (see `textbox`), so colour and announced state agree.
          className={`min-w-0 flex-1 basis-[22ch] bg-panel ${textbox}`}
        />
      </div>
      {/* The typed title stays in the box after a failure. */}
      {create.isError && (
        <p
          id={failureId}
          role="alert"
          className={`mt-1 flex items-center gap-2 text-ui text-stop-t ${BODY_START}`}
        >
          Couldn’t save. What you typed is still here.
          <button type="button" onClick={() => create.mutate(title.value.trim())} className={LINK}>
            Try again
          </button>
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
