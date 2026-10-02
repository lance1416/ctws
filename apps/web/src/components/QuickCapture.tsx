import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { inboxOf, listProjects } from '../api/projects'
import { createTask } from '../api/tasks'
import { refreshTasks } from '../api/taskCache'

// One input on every page: the destination is always the inbox, so there is nothing to choose.
export function QuickCapture() {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  const inbox = projects.data ? inboxOf(projects.data) : undefined
  const missing = projects.isSuccess && !inbox

  const capture = useMutation({
    mutationFn: (t: string) => createTask({ projectId: inbox!.id, title: t }),
    onSuccess: () => {
      setTitle('')
      return refreshTasks(qc, inbox!.id)
    },
  })

  const submit = () => {
    const t = title.trim()
    if (!t || !inbox || capture.isPending) return
    capture.mutate(t)
  }

  return (
    <div className="mb-6">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          // isComposing: Enter confirms an IME candidate, it must not submit half a word.
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit()
        }}
        placeholder="捕获…"
        disabled={!inbox}
        aria-label="捕获"
        className="w-full rounded border border-border-strong bg-surface-raised px-3 py-2 text-fg disabled:opacity-50"
      />
      {missing && (
        <p role="alert" className="mt-2 text-sm text-danger">
          没有找到收件箱，无法捕获。请刷新页面；若仍然如此，请联系管理员检查数据库迁移。
        </p>
      )}
      {/* role="status", not "alert": on the projects page the list already raises its own alert
          for the same failed fetch, and two alerts would be announced (and matched) twice. */}
      {projects.isError && (
        <p role="status" className="mt-2 text-sm text-danger">
          无法加载收件箱，暂时不能捕获。请检查网络后刷新页面
        </p>
      )}
      {capture.isError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          捕获失败，内容仍保留在输入框中，请重试
        </p>
      )}
    </div>
  )
}
