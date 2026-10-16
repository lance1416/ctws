import {
  api,
  type ProjectId,
  type ResponseOf,
  type TaskId,
  type TaskPosition,
  type TaskResponse,
  type UpdateTaskBody,
} from '@ctws/contracts'
import { queryOptions } from '@tanstack/react-query'
import { call } from '../../platform/http/api'
import type { CreateTaskForm } from './logic/taskForm'

// Every key starts with `'tasks'`, so `[['tasks']]` awaits all of them and nothing else.
type Range = { from: string; to: string }

/** The list and its rollups share one cache entry, so the numbers always match the rows. */
export type ProjectTasks = ResponseOf<typeof api.tasks.board>

function listProjectTasks(projectId: ProjectId): Promise<ProjectTasks> {
  return call(api.tasks.board, { query: { projectId } })
}

/** The prefix every project's task list shares, for optimistic edits across all of them. */
export const PROJECT_TASKS = ['tasks', 'list'] as const

export const projectTasksQuery = (projectId: ProjectId) =>
  queryOptions({
    queryKey: [...PROJECT_TASKS, projectId],
    queryFn: () => listProjectTasks(projectId),
  })

/** One task by its id: what a link to a task asks to find the project it lives in. */
export const taskQuery = (id: TaskId) =>
  queryOptions({
    queryKey: ['tasks', 'one', id],
    queryFn: () => call(api.tasks.get, { params: { id } }),
    retry: false,
  })

/**
 * Today's, Done's and Movement's answers are the server's for one day, so that day (the account's,
 * from `useAccountToday`) is in their keys: a page left open past midnight asks again. It is not
 * sent; the server knows the account's day.
 */
export const TODAY_TASKS = ['tasks', 'today']

// The server owns the segments and their order; nothing here re-derives either.
export const todayQuery = (day: string) =>
  queryOptions({
    queryKey: [...TODAY_TASKS, day],
    queryFn: async () => (await call(api.tasks.today, { query: { view: 'today' } })).tasks,
  })

/** Newest first; the server decides each task's day and whether this is the whole history. */
export const completedQuery = (day: string) =>
  queryOptions({
    queryKey: ['tasks', 'completed', day],
    queryFn: () => call(api.tasks.completed, { query: { view: 'completed' } }),
  })

/**
 * Per project: what is late, what is next, when it last moved. Archived projects are not in it.
 * Every number is the server's, computed in the user's timezone; nothing is re-derived here.
 */
export const movementQuery = (day: string) =>
  queryOptions({
    queryKey: ['tasks', 'movement', day],
    queryFn: async () => (await call(api.tasks.movement, { query: { view: 'movement' } })).projects,
  })

// The server owns the matching and the order; nothing here re-ranks or re-filters.
export const taskSearchQuery = (q: string) =>
  queryOptions({
    queryKey: ['tasks', 'search', q],
    queryFn: async () => (await call(api.tasks.search, { query: { q } })).tasks,
  })

export const taskCalendarQuery = (range: Range) =>
  queryOptions({
    queryKey: ['tasks', 'calendar', range.from, range.to],
    queryFn: async () =>
      (await call(api.tasks.calendar, { query: { view: 'calendar', ...range } })).entries,
  })

/**
 * The week under review, or `range` when one is chosen. The server picks the week in the
 * account's zone and reports the bounds it used.
 */
export const reviewQuery = (range: Range | null) =>
  queryOptions({
    queryKey: ['tasks', 'review', range?.from ?? 'week', range?.to ?? ''],
    queryFn: () => call(api.tasks.review, { query: { view: 'review', ...range } }),
  })

/** Both directions for one task, finished blockers included -- what the detail pane shows. */
export const dependenciesQuery = (id: TaskId) =>
  queryOptions({
    queryKey: ['tasks', 'dependencies', id],
    queryFn: () => call(api.tasks.dependencies, { params: { id } }),
  })

/** `id` is the task that waits; `blockerId` is what it waits for. */
export function addDependency(id: TaskId, blockerId: TaskId): Promise<void> {
  return call(api.tasks.addDependency, { params: { id, blockerId } })
}

export function removeDependency(id: TaskId, blockerId: TaskId): Promise<void> {
  return call(api.tasks.removeDependency, { params: { id, blockerId } })
}

/** Without a `status` the server files the task under `todo`. */
export function createTask(body: CreateTaskForm): Promise<TaskResponse> {
  return call(api.tasks.create, { body })
}

export function patchTask(id: TaskId, body: UpdateTaskBody): Promise<TaskResponse> {
  return call(api.tasks.update, { params: { id }, body })
}

/** A move is a PATCH that names where the task lands; the server keeps the tree whole. */
export function moveTask(id: TaskId, position: TaskPosition): Promise<TaskResponse> {
  return call(api.tasks.update, { params: { id }, body: position })
}

export function deleteTask(id: TaskId): Promise<void> {
  return call(api.tasks.remove, { params: { id } })
}
