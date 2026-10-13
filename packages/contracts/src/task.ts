import { z } from 'zod'
import { WINDOW_REFUSED, windowIsBounded } from './calendar'
import { calendarDate, instant } from './common'

export const TASK_STATUSES = ['backlog', 'todo', 'in_progress', 'done', 'cancelled'] as const
const taskStatus = z.enum(TASK_STATUSES)
export type TaskStatus = z.infer<typeof taskStatus>

const title = z.string().trim().min(1).max(500)
const notes = z.string().max(100_000)
const manualProgress = z.number().min(0).max(1)

// The server computes rank; neither create nor update accepts one.
export const createTaskBody = z
  .object({
    projectId: z.uuid(),
    parentId: z.uuid().nullish(),
    title,
    notes: notes.nullish(),
    /**
     * `todo`, not `backlog`: the rollup skips a backlog node before its children, so a backlog
     * default would leave a parent at no progress with every child done.
     */
    status: taskStatus.default('todo'),
    scheduledOn: calendarDate.nullish(),
    dueAt: instant.nullish(),
    manualProgress: manualProgress.nullish(),
  })
  .strict()

// No parentId, projectId or rank: those change through move, which guards the tree.
export const updateTaskBody = z
  .object({
    title,
    notes: notes.nullable(),
    status: taskStatus,
    scheduledOn: calendarDate.nullable(),
    dueAt: instant.nullable(),
    manualProgress: manualProgress.nullable(),
  })
  .partial()
  .strict()

/** The neighbours the task lands between; the server computes the rank. */
export const moveTaskBody = z
  .object({
    projectId: z.uuid(),
    parentId: z.uuid().nullable(),
    beforeId: z.uuid().optional(),
    afterId: z.uuid().optional(),
  })
  .strict()

export const taskResponse = z
  .object({
    id: z.uuid(),
    projectId: z.uuid(),
    parentId: z.uuid().nullable(),
    title: z.string(),
    notes: z.string().nullable(),
    status: taskStatus,
    scheduledOn: calendarDate.nullable(),
    dueAt: instant.nullable(),
    rank: z.string(),
    manualProgress: z.number().nullable(),
    completedAt: instant.nullable(),
    createdAt: instant,
    updatedAt: instant,
  })
  .strict()

/** Derived from a task's whole subtree, so it travels beside the task, never on it. */
const rollupResponse = z
  .object({
    /** 0..1, or null for a task the rollup leaves out (backlog, cancelled). */
    progress: z.number().min(0).max(1).nullable(),
    counts: z
      .object({
        backlog: z.number().int().min(0),
        todo: z.number().int().min(0),
        in_progress: z.number().int().min(0),
        done: z.number().int().min(0),
        cancelled: z.number().int().min(0),
      })
      .strict(),
    overdue: z.number().int().min(0),
    dueSoon: z.number().int().min(0),
    /** The latest logged change anywhere in the subtree. */
    lastActivityAt: instant.nullable(),
  })
  .strict()
export type RollupResponse = z.infer<typeof rollupResponse>

/** Another task at the end of a dependency, named with its project because one may cross. */
const dependencyRef = z
  .object({
    id: z.uuid(),
    title: z.string(),
    projectId: z.uuid(),
    projectName: z.string(),
    done: z.boolean(),
  })
  .strict()
export type DependencyRef = z.infer<typeof dependencyRef>

export const dependencyLists = z
  .object({ blockedBy: z.array(dependencyRef), blocks: z.array(dependencyRef) })
  .strict()

export const addDependencyBody = z.object({ blockerId: z.uuid() }).strict()

export const dependencyParams = z.object({ id: z.uuid(), blockerId: z.uuid() }).strict()

export const projectTasksQuery = z.object({ projectId: z.uuid() }).strict()

/** A project's flat task list with each task's rollup and what is still in its way. */
export const projectTasksResponse = z
  .object({
    tasks: z.array(taskResponse),
    rollups: z.record(z.uuid(), rollupResponse),
    /** Keyed by the waiting task; unfinished blockers only. */
    blockers: z.record(z.uuid(), z.array(dependencyRef)),
  })
  .strict()

/** What changed state in a window, read from the event log and grouped by project. */
const reviewTask = z.object({ id: z.uuid(), title: z.string(), at: instant }).strict()

export const reviewResponse = z
  .object({
    /** The window's own bounds, as days in the account's zone. */
    from: calendarDate,
    to: calendarDate,
    projects: z.array(
      z
        .object({
          projectId: z.uuid(),
          projectName: z.string(),
          finished: z.array(reviewTask),
          started: z.array(reviewTask),
          dropped: z.array(reviewTask),
        })
        .strict(),
    ),
  })
  .strict()
export type ReviewResponse = z.infer<typeof reviewResponse>

export const reviewQuery = z
  .object({ from: calendarDate.optional(), to: calendarDate.optional() })
  .strict()
  .refine(windowIsBounded, { message: WINDOW_REFUSED, path: ['to'] })

// Display order. Which segment wins for a task matching several is decided in `listToday`'s SQL.
const TODAY_SEGMENTS = ['overdue', 'today', 'in_progress'] as const
export type TodaySegment = (typeof TODAY_SEGMENTS)[number]

export const todayTaskResponse = taskResponse
  .extend({
    projectName: z.string(),
    parentTitle: z.string().nullable(),
    segment: z.enum(TODAY_SEGMENTS),
    /** Unfinished blockers. */
    blockedBy: z.array(dependencyRef),
  })
  .strict()
export type TodayTaskResponse = z.infer<typeof todayTaskResponse>

export const todayResponse = z.object({ tasks: z.array(todayTaskResponse) }).strict()

export const completedTaskResponse = taskResponse
  .extend({
    projectName: z.string(),
    parentTitle: z.string().nullable(),
    /** The day it was finished, in the account's zone. */
    completedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict()
export type CompletedTaskResponse = z.infer<typeof completedTaskResponse>

/** The latest finished tasks; `truncated` says older ones exist. */
export const completedResponse = z
  .object({ tasks: z.array(completedTaskResponse), truncated: z.boolean() })
  .strict()
export type CompletedResponse = z.infer<typeof completedResponse>

/** One project's movement: counts, never a ratio. Days are in the account's zone. */
export const projectMovementResponse = z
  .object({
    projectId: z.uuid(),
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
  .strict()
export type ProjectMovementResponse = z.infer<typeof projectMovementResponse>

export const movementResponse = z.object({ projects: z.array(projectMovementResponse) }).strict()

export const searchTaskResponse = taskResponse
  .extend({
    projectName: z.string(),
    parentTitle: z.string().nullable(),
    /** Archived projects are searched too; the result says so. */
    projectArchived: z.boolean(),
  })
  .strict()
export type SearchTaskResponse = z.infer<typeof searchTaskResponse>

export const searchTasksResponse = z.object({ tasks: z.array(searchTaskResponse) }).strict()

// No reorder event: a pure rank change is not logged.
const TASK_EVENT_TYPES = [
  'created',
  'status_changed',
  'due_changed',
  'scheduled_changed',
  'moved',
  'title_changed',
  'notes_changed',
  'progress_set',
  // Logged on the waiting task.
  'dependency_added',
  'dependency_removed',
  'deleted',
  'restored',
] as const
export type TaskEventType = (typeof TASK_EVENT_TYPES)[number]

export const taskEventResponse = z
  .object({
    id: z.uuid(),
    taskId: z.uuid(),
    actorUserId: z.uuid(),
    type: z.enum(TASK_EVENT_TYPES),
    /** The changed fields' before and after, never a row snapshot. */
    payload: z.record(z.string(), z.unknown()),
    source: z.string(),
    occurredAt: instant,
  })
  .strict()

export const TASK_EVENTS_PAGE = { default: 50, max: 100 } as const

export const taskEventsQuery = z
  .object({
    cursor: z.string().max(256).optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(TASK_EVENTS_PAGE.max)
      .default(TASK_EVENTS_PAGE.default),
  })
  .strict()

export const taskEventsResponse = z
  .object({ events: z.array(taskEventResponse), nextCursor: z.string().nullable() })
  .strict()

export type CreateTaskBody = z.infer<typeof createTaskBody>
export type UpdateTaskBody = z.infer<typeof updateTaskBody>
export type MoveTaskBody = z.infer<typeof moveTaskBody>
export type TaskResponse = z.infer<typeof taskResponse>
export type TaskEventResponse = z.infer<typeof taskEventResponse>
