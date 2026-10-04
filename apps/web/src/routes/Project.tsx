import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { listProjects } from '../api/projects'
import { createTask } from '../api/tasks'
import { refreshTasks } from '../api/taskCache'
import { TaskTree } from '../components/TaskTree'

export function Project() {
  const { id } = useParams()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  // Same query function as every other reader of ['projects']: they share one cache entry, so
  // they must agree on its shape.
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  const name = projects.data?.find((p) => p.id === id)?.name

  const create = useMutation({
    mutationFn: (t: string) => createTask({ projectId: id!, title: t, parentId: null }),
    onSuccess: () => {
      setTitle('')
      return refreshTasks(qc, id!)
    },
  })

  const submit = () => {
    const t = title.trim()
    if (t && id && !create.isPending) create.mutate(t)
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">{name ?? ''}</h1>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit()
        }}
        placeholder="新任务"
        aria-label="新任务"
        className="mt-5 h-10 w-full max-w-[40ch] rounded-md border border-border-strong bg-surface px-3 text-fg placeholder:text-fg-muted"
      />
      {create.isError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          创建失败，请重试
        </p>
      )}
      {id && <TaskTree key={id} projectId={id} />}
    </>
  )
}
