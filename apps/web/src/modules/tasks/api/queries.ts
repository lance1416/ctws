import { type ProjectId, type TaskId } from '@ctws/contracts'
import { queryOptions } from '@tanstack/react-query'
import { listCompleted } from './completed'
import { listMovement } from './movement'
import { listReview } from './review'
import { searchTasks } from './search'
import { getTask, listProjectTasks, taskDependencies } from './tasks'
import { listToday, taskCalendar } from './today'

// Every key starts with `'tasks'`, so `[['tasks']]` awaits all of them and nothing else.
type Range = { from: string; to: string }

export const todayQuery = () => queryOptions({ queryKey: ['tasks', 'today'], queryFn: listToday })

export const completedQuery = () =>
  queryOptions({ queryKey: ['tasks', 'completed'], queryFn: listCompleted })

/** Per project: what is late, what is next, when it last moved. Archived projects are not in it. */
export const movementQuery = () =>
  queryOptions({ queryKey: ['tasks', 'movement'], queryFn: listMovement })

/** The prefix every project's task list shares, for optimistic edits across all of them. */
export const PROJECT_TASKS = ['tasks', 'list'] as const

export const projectTasksQuery = (projectId: ProjectId) =>
  queryOptions({
    queryKey: [...PROJECT_TASKS, projectId],
    queryFn: () => listProjectTasks(projectId),
  })

export const taskQuery = (id: TaskId) =>
  queryOptions({ queryKey: ['tasks', 'one', id], queryFn: () => getTask(id), retry: false })

export const taskSearchQuery = (q: string) =>
  queryOptions({ queryKey: ['tasks', 'search', q], queryFn: () => searchTasks(q) })

export const taskCalendarQuery = (range: Range) =>
  queryOptions({
    queryKey: ['tasks', 'calendar', range.from, range.to],
    queryFn: () => taskCalendar(range),
  })

/** The week under review, or `range` when one is chosen. */
export const reviewQuery = (range: Range | null) =>
  queryOptions({
    queryKey: ['tasks', 'review', range?.from ?? 'week', range?.to ?? ''],
    queryFn: () => listReview(range ?? undefined),
  })

export const dependenciesQuery = (id: TaskId) =>
  queryOptions({ queryKey: ['tasks', 'dependencies', id], queryFn: () => taskDependencies(id) })
