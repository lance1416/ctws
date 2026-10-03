import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { DeleteConfirm } from '../components/DeleteConfirm'
import { refreshProjects } from '../api/taskCache'
import { createProject, deleteProject, listProjects } from '../api/projects'
import { listProjectTasks } from '../api/tasks'
import { tasksKey } from '../api/taskCache'

export function Projects() {
  const qc = useQueryClient()
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
      setConfirming((c) => (c?.id === id ? { id, name, tasks: tasks.length } : c))
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
      <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold focus:outline-none">
        项目
      </h1>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit()
        }}
        placeholder="新项目"
        aria-label="新项目"
        className="mt-6 h-10 w-full border-b border-border-strong bg-transparent px-0.5 text-fg placeholder:text-fg-muted"
      />
      {projects.isError && (
        <p role="alert" className="mt-4 text-sm text-danger">
          项目加载失败
        </p>
      )}
      {(create.isError || remove.isError) && (
        <p role="alert" className="mt-4 text-sm text-danger">
          操作失败，请重试
        </p>
      )}
      {/* Rendered in the order the server returns: it puts the inbox first. Sorting here too
          would give two sorts that drift apart. */}
      <ul className="mt-6 flex flex-col">
        {projects.data?.map((p) => (
          <li
            key={p.id}
            role="listitem"
            className="flex flex-wrap items-center justify-between gap-x-3"
          >
            <Link
              to={`/projects/${p.id}`}
              className="-mx-2 flex-1 rounded-md px-2 py-2 font-medium hover:bg-surface-sunken"
            >
              {p.name}
            </Link>
            {!p.isInbox && (
              <button
                data-delete={p.id}
                className="rounded-md px-2 py-1 text-sm text-fg-muted hover:text-danger disabled:opacity-50"
                disabled={remove.isPending}
                onClick={() => askDelete(p.id, p.name)}
              >
                删除
              </button>
            )}
            {confirming?.id === p.id && (
              <DeleteConfirm
                label="确认删除项目"
                className="basis-full pb-2"
                message={
                  confirming.tasks === null
                    ? `删除「${p.name}」…`
                    : confirming.tasks < 0
                      ? `删除「${p.name}」及其全部任务，无法恢复。`
                      : `删除「${p.name}」及其 ${confirming.tasks} 条任务，无法恢复。`
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
