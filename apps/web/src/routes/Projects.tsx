import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { refreshProjects } from '../api/taskCache'
import { createProject, deleteProject, listProjects } from '../api/projects'

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

  const submit = () => {
    const n = name.trim()
    if (n && !create.isPending) create.mutate({ name: n })
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">项目</h1>
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
          <li key={p.id} role="listitem" className="flex items-center justify-between gap-3">
            <Link
              to={`/projects/${p.id}`}
              className="-mx-2 flex-1 rounded-md px-2 py-2 font-medium hover:bg-surface-sunken"
            >
              {p.name}
            </Link>
            {!p.isInbox && (
              <button
                className="rounded-md px-2 py-1 text-sm text-fg-muted hover:text-danger disabled:opacity-50"
                disabled={remove.isPending}
                onClick={() => remove.mutate(p.id)}
              >
                删除
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
