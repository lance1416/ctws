import {
  type ObjectType,
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

type Range = { from: string; to: string }

/**
 * This module's query keys. Every one starts with `'tasks'`, so `all` reaches each of them and
 * nothing else.
 *
 * Today's, Done's and Movement's answers are the server's for one day, so that day (the account's,
 * from `useAccountToday`) is in their keys: a page left open past midnight asks again. It is not
 * sent; the server knows the account's day.
 */
export const taskKeys = {
  all: ['tasks'] as const,
  /** Every project's list, for optimistic edits across all of them. */
  lists: ['tasks', 'list'] as const,
  list: (projectId: ProjectId) => [...taskKeys.lists, projectId] as const,
  one: (id: TaskId) => ['tasks', 'one', id] as const,
  /** Today's list, whichever day it was read for. */
  todays: ['tasks', 'today'] as const,
  today: (day: string) => [...taskKeys.todays, day] as const,
  completed: (day: string) => ['tasks', 'completed', day] as const,
  movement: (day: string) => ['tasks', 'movement', day] as const,
  ready: (day: string) => ['tasks', 'ready', day] as const,
  calendar: (range: Range) => ['tasks', 'calendar', range.from, range.to] as const,
  reviewWeeks: (today: string) => ['tasks', 'review-weeks', today] as const,
  review: (range: Range) => ['tasks', 'review', range.from, range.to] as const,
  dependencies: (id: TaskId) => ['tasks', 'dependencies', id] as const,
}

/** The list and its rollups share one cache entry, so the numbers always match the rows. */
export type ProjectTasks = ResponseOf<typeof api.tasks.board>

export const projectTasksQuery = (projectId: ProjectId) =>
  queryOptions({
    queryKey: taskKeys.list(projectId),
    queryFn: ({ signal }) => call(api.tasks.board, { query: { projectId } }, { signal }),
  })

/** One task by its id: what a link to a task asks to find the project it lives in. */
export const taskQuery = (id: TaskId) =>
  queryOptions({
    queryKey: taskKeys.one(id),
    queryFn: ({ signal }) => call(api.tasks.get, { params: { id } }, { signal }),
  })

/**
 * The scope of the writes that move rows at once, before the server answers: they go out one at a
 * time, so two quick moves land in the order they were made.
 */
export const ROW_WRITES = { id: 'tasks:rows' }

// The server owns the segments and their order; nothing here re-derives either.
export const todayQuery = (day: string) =>
  queryOptions({
    queryKey: taskKeys.today(day),
    queryFn: async ({ signal }) =>
      (await call(api.tasks.today, { query: { view: 'today' } }, { signal })).tasks,
  })

/** Newest first; the server decides each task's day and whether this is the whole history. */
export const completedQuery = (day: string) =>
  queryOptions({
    queryKey: taskKeys.completed(day),
    queryFn: ({ signal }) =>
      call(api.tasks.completed, { query: { view: 'completed' } }, { signal }),
  })

/**
 * Per project: what is late, what is next, when it last moved. Archived projects are not in it.
 * Every number is the server's, computed in the user's timezone; nothing is re-derived here.
 */
export const movementQuery = (day: string) =>
  queryOptions({
    queryKey: taskKeys.movement(day),
    queryFn: async ({ signal }) =>
      (await call(api.tasks.movement, { query: { view: 'movement' } }, { signal })).projects,
  })

/** Leaves that could be started now (FR-041), the server's order. */
export const readyQuery = (day: string) =>
  queryOptions({
    queryKey: taskKeys.ready(day),
    queryFn: async ({ signal }) =>
      (await call(api.tasks.ready, { query: { view: 'ready' } }, { signal })).tasks,
  })

// The server owns the matching and the order; nothing here re-ranks or re-filters.
export const taskCalendarQuery = (range: Range) =>
  queryOptions({
    queryKey: taskKeys.calendar(range),
    queryFn: async ({ signal }) =>
      (await call(api.tasks.calendar, { query: { view: 'calendar', ...range } }, { signal }))
        .entries,
  })

/** What happened in a week under review, read from the change log; the server says its bounds. */
export const reviewQuery = (range: Range) =>
  queryOptions({
    queryKey: taskKeys.review(range),
    queryFn: ({ signal }) =>
      call(api.tasks.review, { query: { view: 'review', ...range } }, { signal }),
  })

/** The review's weeks with how many each finished; read again on a new day, when one begins. */
export const reviewWeeksQuery = (today: string) =>
  queryOptions({
    queryKey: taskKeys.reviewWeeks(today),
    queryFn: async ({ signal }) =>
      (await call(api.tasks.reviewWeeks, { query: { view: 'review-weeks' } }, { signal })).weeks,
  })

/** Both directions for one task, finished blockers included -- what the detail pane shows. */
export const dependenciesQuery = (id: TaskId) =>
  queryOptions({
    queryKey: taskKeys.dependencies(id),
    queryFn: ({ signal }) => call(api.tasks.dependencies, { params: { id } }, { signal }),
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

/** Relates a new task to the thing it was made from: a person, an organisation (FR-061). */
export function relateTask(id: TaskId, to: { type: ObjectType; id: string }): Promise<unknown> {
  return call(api.relations.create, { body: { from: { type: 'task', id }, to } })
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
