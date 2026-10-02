import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { createProject, deleteProject, listProjects } from '../api/projects'

export function Projects() {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })

  const create = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      setName('')
      return qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
  const remove = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
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
        className="mt-4 w-full rounded border border-border-strong bg-surface-raised px-3 py-2 text-fg"
      />
      {projects.isError && (
        <p role="alert" className="mt-4 text-danger">
          项目加载失败
        </p>
      )}
      {(create.isError || remove.isError) && (
        <p role="alert" className="mt-4 text-danger">
          操作失败，请重试
        </p>
      )}
      {/* Rendered in the order the server returns: it puts the inbox first. Sorting here too
          would give two sorts that drift apart. */}
      <ul className="mt-4 flex flex-col gap-1">
        {projects.data?.map((p) => (
          <li key={p.id} role="listitem" className="flex items-center gap-3">
            <Link to={`/projects/${p.id}`} className="text-accent">
              {p.name}
            </Link>
            {!p.isInbox && (
              <button
                className="text-sm text-danger"
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
