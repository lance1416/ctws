import { z } from 'zod'
import { projectId, type ProjectId, taskId, type TaskId } from './id'
import { WINDOW_REFUSED, windowIsBounded } from './calendar'
import { calendarDate, documentText, instant, patchOf, titleText, viewQuery } from './common'
import { pageInfo, pageQuery } from './page'

export const TASK_STATUSES = ['backlog', 'todo', 'in_progress', 'done', 'cancelled'] as const
const taskStatus = z.enum(TASK_STATUSES)
export type TaskStatus = z.infer<typeof taskStatus>

/** The statuses that close a task: off Today, the calendar and every open count. */
export const FINISHED_TASK_STATUSES = ['done', 'cancelled'] as const satisfies readonly TaskStatus[]

/** Left out of progress, with everything under them: not started on purpose, or not happening. */
export const UNCOUNTED_TASK_STATUSES = [
  'backlog',
  'cancelled',
] as const satisfies readonly TaskStatus[]

/**
 * The count tasks adds to each project in the list: its tasks neither finished, cancelled nor
 * deleted.
 */
export const OPEN_TASKS_COLUMN = 'openTasks'

/** The board's columns, left to right; `cancelled` is not a step of the work. */
export const BOARD_TASK_STATUSES = TASK_STATUSES.filter(
  (s): s is Exclude<TaskStatus, 'cancelled'> => s !== 'cancelled',
)

/** The transitions a review recounts, by the list each goes in. */
export const REVIEW_TRANSITIONS = {
  finished: 'done',
  started: 'in_progress',
  dropped: 'cancelled',
} as const satisfies Record<string, TaskStatus>
export type ReviewList = keyof typeof REVIEW_TRANSITIONS

/**
 * A new task's status. `todo`, not `backlog`: the rollup skips a backlog node before its children,
 * so a backlog default would leave a parent at no progress with every child done.
 */
export const NEW_TASK_STATUS = 'todo' satisfies TaskStatus

/** The deepest a task may sit; a root is at depth 1. */
export const MAX_TASK_DEPTH = 10

const title = titleText
const notes = documentText

export const taskParams = z.object({ id: taskId }).strict()

// The server computes rank; neither create nor update accepts one.
export const createTaskBody = z
  .object({
    projectId: projectId,
    parentId: taskId.nullish(),
    title,
    notes: notes.nullish(),
    status: taskStatus.default(NEW_TASK_STATUS),
    scheduledOn: calendarDate.nullish(),
    dueAt: instant.nullish(),
  })
  .strict()

/**
 * Where a task lands: the project and parent it goes under, and at most one neighbour it goes
 * next to (at the end without one). The server computes the rank.
 */
const taskPosition = {
  projectId,
  parentId: taskId.nullable(),
  beforeId: taskId,
  afterId: taskId,
}
const POSITION_KEYS = Object.keys(taskPosition)

/** A task's own fields, as an update writes them: null clears one. */
export const taskFields = {
  title,
  notes: notes.nullable(),
  status: taskStatus,
  scheduledOn: calendarDate.nullable(),
  dueAt: instant.nullable(),
}

/**
 * A task's own fields, and its position. A position is checked as a whole: the tree stays
 * acyclic, within depth, and on one project. No rank: the server computes it.
 */
export const updateTaskBody = patchOf({ ...taskFields, ...taskPosition }).refine(
  (b) =>
    !POSITION_KEYS.some((k) => k in b) || (b.projectId !== undefined && b.parentId !== undefined),
  {
    message: 'a move names both the projectId and the parentId it lands under',
    path: ['parentId'],
  },
)

export const taskResponse = z.object({
  id: taskId,
  projectId: projectId,
  parentId: taskId.nullable(),
  title: z.string(),
  notes: z.string().nullable(),
  status: taskStatus,
  scheduledOn: calendarDate.nullable(),
  dueAt: instant.nullable(),
  rank: z.string(),
  completedAt: instant.nullable(),
  createdAt: instant,
  updatedAt: instant,
})

/** Derived from a task's whole subtree, so it travels beside the task, never on it. */
const rollupResponse = z.object({
  /** 0..1, or null for a task the rollup leaves out (backlog, cancelled). */
  progress: z.number().min(0).max(1).nullable(),
  /** Across the subtree, this task included. */
  inProgress: z.number().int().min(0),
  overdue: z.number().int().min(0),
})
export type RollupResponse = z.infer<typeof rollupResponse>

/** Another task at the end of a dependency, named with its project because one may cross. */
const dependencyRef = z.object({
  id: taskId,
  title: z.string(),
  projectId: projectId,
  projectName: z.string(),
  done: z.boolean(),
})
export type DependencyRef = z.infer<typeof dependencyRef>

export const dependencyLists = z.object({
  blockedBy: z.array(dependencyRef),
  blocks: z.array(dependencyRef),
})

export const dependencyParams = z.object({ id: taskId, blockerId: taskId }).strict()

export const projectTasksQuery = z.object({ projectId: projectId }).strict()

/** A project's flat task list with each task's rollup and what is still in its way. */
export const projectTasksResponse = z.object({
  tasks: z.array(taskResponse),
  rollups: z.record(taskId, rollupResponse),
  /** Keyed by the waiting task; unfinished blockers only. */
  blockers: z.record(taskId, z.array(dependencyRef)),
})

/** What changed state in a window, read from the event log and grouped by project. */
const reviewTask = z.object({ id: taskId, title: z.string(), at: instant })

export const reviewResponse = z.object({
  /** The window's own bounds, as days in the account's zone. */
  from: calendarDate,
  to: calendarDate,
  projects: z.array(
    z.object({
      projectId: projectId,
      projectName: z.string(),
      finished: z.array(reviewTask),
      started: z.array(reviewTask),
      dropped: z.array(reviewTask),
    }),
  ),
})
export type ReviewResponse = z.infer<typeof reviewResponse>

export const reviewQuery = viewQuery('review', {
  from: calendarDate.optional(),
  to: calendarDate.optional(),
}).refine(windowIsBounded, { message: WINDOW_REFUSED, path: ['to'] })

// Display order. Which segment wins for a task matching several is decided in `listToday`'s SQL.
const TODAY_SEGMENTS = ['overdue', 'today', 'in_progress'] as const

export const todayTaskResponse = taskResponse.extend({
  projectName: z.string(),
  parentTitle: z.string().nullable(),
  segment: z.enum(TODAY_SEGMENTS),
  /** Unfinished blockers. */
  blockedBy: z.array(dependencyRef),
})
export type TodayTaskResponse = z.infer<typeof todayTaskResponse>

export const todayResponse = z.object({ tasks: z.array(todayTaskResponse) })

export const completedTaskResponse = taskResponse.extend({
  completedAt: instant,
  projectName: z.string(),
  parentTitle: z.string().nullable(),
  /** The day it was finished, in the account's zone. */
  completedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
export type CompletedTaskResponse = z.infer<typeof completedTaskResponse>

/** How many finished tasks one page holds; the weekly review covers older ones. */
const COMPLETED_PAGE = 200

export const completedQuery = viewQuery('completed', pageQuery(COMPLETED_PAGE))

/** The latest finished tasks, newest first; a next cursor says older ones exist. */
export const completedResponse = z.object({
  tasks: z.array(completedTaskResponse),
  page: pageInfo,
})

/** One project's movement: counts, never a ratio. Days are in the account's zone. */
export const projectMovementResponse = z.object({
  projectId: projectId,
  projectName: z.string(),
  doneThisWeek: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  /** Open and due before today, counted as Today's overdue segment is. */
  overdue: z.number().int().nonnegative(),
  lastActivityOn: calendarDate.nullable(),
  quietDays: z.number().int().nonnegative().nullable(),
  /** The day of the next open deadline from today on. */
  nextDueOn: calendarDate.nullable(),
})
export type ProjectMovementResponse = z.infer<typeof projectMovementResponse>

export const movementResponse = z.object({ projects: z.array(projectMovementResponse) })

export const searchTaskResponse = taskResponse.extend({
  projectName: z.string(),
  parentTitle: z.string().nullable(),
  /** Archived projects are searched too; the result says so. */
  projectArchived: z.boolean(),
})
export type SearchTaskResponse = z.infer<typeof searchTaskResponse>

export const searchTasksResponse = z.object({
  tasks: z.array(searchTaskResponse),
  page: pageInfo,
})

// No reorder event: a pure rank change is not logged.
export const TASK_EVENT_TYPES = [
  'created',
  'status_changed',
  'due_changed',
  'scheduled_changed',
  'moved',
  'title_changed',
  'notes_changed',
  // Logged on the waiting task.
  'dependency_added',
  'dependency_removed',
  'deleted',
] as const
export type TaskEventType = (typeof TASK_EVENT_TYPES)[number]

export type CreateTaskBody = z.infer<typeof createTaskBody>
export type UpdateTaskBody = z.infer<typeof updateTaskBody>
export type TaskPosition = {
  projectId: ProjectId
  parentId: TaskId | null
  beforeId?: TaskId | undefined
  afterId?: TaskId | undefined
}
export type TaskResponse = z.infer<typeof taskResponse>
