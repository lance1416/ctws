import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { DeleteConfirm } from '../components/DeleteConfirm'
import { refreshProjects } from '../api/taskCache'
import { createProject, deleteProject, listProjects } from '../api/projects'
import { listProjectTasks } from '../api/tasks'
import { tasksKey } from '../api/taskCache'
import { railClass } from '../projectColor'
import { useComposing } from '../composition'

export function Projects() {
  const qc = useQueryClient()
  const composing = useComposing()
  const [name, setName] = useState('')
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })

  const create = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      setName('')
      return refreshProjects(qc)
    },
  })
  const remove = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => refreshProjects(qc),
  })

  // Deleting a project takes its tasks with it and cannot be undone, so it asks first, here in
  // the page (a browser confirm() would block the automation this app is tested with). The ask
  // names what is lost: the project and how many tasks go with it, counted when it is opened.
  const [confirming, setConfirming] = useState<{
    id: string
    name: string
    tasks: number | null
  } | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const askDelete = async (id: string, name: string) => {
    setConfirming({ id, name, tasks: null })
    try {
      const tasks = await qc.fetchQuery({
        queryKey: tasksKey(id),
        queryFn: () => listProjectTasks(id),
        staleTime: 0,
      })
      setConfirming((c) => (c?.id === id ? { id, name, tasks: tasks.tasks.length } : c))
    } catch {
      // Without the count the user would be confirming blind; say so and let them cancel.
      setConfirming((c) => (c?.id === id ? { id, name, tasks: -1 } : c))
    }
  }
  const cancelDelete = () => {
    const id = confirming?.id
    setConfirming(null)
    if (id)
      queueMicrotask(() => document.querySelector<HTMLElement>(`[data-delete="${id}"]`)?.focus())
  }
  useEffect(() => {
    if (!confirming) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancelDelete()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const submit = () => {
    const n = name.trim()
    if (n && !create.isPending) create.mutate({ name: n })
  }

  return (
    <>
      <h1 ref={heading} tabIndex={-1} className="text-xl font-semibold focus:outline-none">
        Projects
      </h1>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        {...composing.bind}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !composing.composingNow(e)) submit()
        }}
        placeholder="New project"
        aria-label="New project"
        className="mt-5 h-10 w-full max-w-[40ch] rounded-md border border-border-strong bg-surface px-3 text-fg placeholder:text-fg-muted"
      />
      {projects.isError && (
        <p role="alert" className="mt-4 text-sm text-danger">
          Couldn't load projects
        </p>
      )}
      {(create.isError || remove.isError) && (
        <p role="alert" className="mt-4 text-sm text-danger">
          That didn't work. Try again.
        </p>
      )}
      {/* Rendered in the order the server returns: it puts the inbox first. Sorting here too
          would give two sorts that drift apart. */}
      {/* A list measure of its own, like every other list in the app (see RowParts): at 64ch the
          count sat ~450px from the short project name it belonged to -- the stranded right-hand
          column stages 1 and 2 fixed on Today and Done and never came back for here. */}
      <ul className="mt-5 flex max-w-[30rem] flex-col">
        {projects.data?.map((p) => (
          <li
            key={p.id}
            role="listitem"
            // A grid, not justify-between: with the count and the delete control floating, the
            // inbox row (which has no delete control) pushed its count further right than every
            // other row's, and a column of numbers that does not line up is worse than none.
            className="grid grid-cols-[minmax(0,1fr)_auto_4rem] items-center gap-x-3"
          >
            <Link
              to={`/projects/${p.id}`}
              className="-mx-2 flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-hover"
            >
              {/* The identity rail, same meaning and same width as in the left column and (from
                  stage 2) on every task row. Never alone: the name is right beside it. */}
              <span
                aria-hidden="true"
                className={`h-4 w-[3px] shrink-0 rounded-full ${railClass(p.color)}`}
              />
              <span className="truncate">{p.name}</span>
            </Link>
            {/* HOW MUCH IS WAITING HERE (D47). The server's own count of open tasks, never
                counted on this side.
                OUTSIDE the link on purpose: inside, it would become part of the link's
                accessible name, and "P" would no longer be the name of the link to P.
                Zero is drawn as NOTHING, the way the left rail draws it: a column whose job is
                "how much is waiting here" is silent when nothing is, or the emptiest row is the
                loudest thing on the page. */}
            <span data-count className="justify-self-end text-xs text-fg-muted">
              {p.openTasks > 0 ? `${p.openTasks} open` : ''}
            </span>
            {/* The slot is always there, empty for the inbox: the control may be absent, the
                column may not move. */}
            <span className="justify-self-start">
              {!p.isInbox && (
                <button
                  data-delete={p.id}
                  className="rounded-md px-2 py-1 text-sm text-fg-muted hover:text-danger disabled:opacity-50"
                  disabled={remove.isPending}
                  onClick={() => askDelete(p.id, p.name)}
                >
                  Delete
                </button>
              )}
            </span>
            {confirming?.id === p.id && (
              <DeleteConfirm
                label="Confirm deleting this project"
                className="col-span-3 pb-2"
                message={
                  confirming.tasks === null
                    ? `Delete “${p.name}”…`
                    : confirming.tasks < 0
                      ? `Delete “${p.name}” and all its tasks. This cannot be undone.`
                      : `Delete “${p.name}” and its ${confirming.tasks} tasks. This cannot be undone.`
                }
                busy={confirming.tasks === null || remove.isPending}
                onConfirm={() =>
                  remove.mutate(p.id, {
                    onSuccess: () => {
                      setConfirming(null)
                      heading.current?.focus()
                    },
                  })
                }
                onCancel={cancelDelete}
              />
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
