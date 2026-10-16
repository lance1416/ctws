import { useQuery } from '@tanstack/react-query'
import { useAccountToday } from '../../../shell/auth'
import { useProjects } from '../../../shell/projects'
import { todayQuery } from '../api'
import { openTasksOf } from '../logic/openTasks'
import { todaySegments } from '../logic/today'

/** The rail's count for Today. */
export function TodayCount() {
  const today = useQuery(todayQuery(useAccountToday()))
  const count = today.data?.length ?? null
  if (count === null || count <= 0) return null
  return (
    <span data-count className="ml-auto pl-1 text-xs text-ink-muted">
      {count}
    </span>
  )
}

/** Things' count for tasks: how many are open across every line of work, zero included. */
export function OpenTaskCount() {
  const projects = useProjects()
  if (!projects.data) return null
  const open = projects.data.reduce((n, p) => n + openTasksOf(p), 0)
  return <span data-count>{open} open</span>
}

/** What is pressing among them, from Today's own list: what is late and what is planned. */
export function TaskStatusLine() {
  const today = useQuery(todayQuery(useAccountToday()))
  const { overdue, planned } = todaySegments(today.data ?? [])
  const late = overdue.length
  const parts = [
    late > 0 && `${late} overdue`,
    planned.length > 0 && `${planned.length} planned for today`,
  ]
  const line = parts.filter(Boolean).join(', ')
  return line ? <span data-status>{line}</span> : null
}
