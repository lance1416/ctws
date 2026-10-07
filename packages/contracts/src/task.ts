import { z } from 'zod'

export const TASK_STATUSES = ['backlog', 'todo', 'in_progress', 'done', 'cancelled'] as const
export const taskStatus = z.enum(TASK_STATUSES)
export type TaskStatus = z.infer<typeof taskStatus>

// A calendar day ("which day I plan to do this"), deliberately not an instant. We do not use
// z.coerce.date(): it accepts full timestamps and would silently turn a day into an instant.
// The regex fixes the shape; the round trip through Date.UTC rejects impossible days (2026-02-30).
export const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected a date in YYYY-MM-DD form')
  .refine(
    (value) => {
      const [y, m, d] = value.split('-').map(Number) as [number, number, number]
      const date = new Date(Date.UTC(y, m - 1, d))
      return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    },
    { message: 'not a real calendar date' },
  )

// An instant, e.g. the hard deadline. Offsets are allowed; the server stores timestamptz.
const instant = z.iso.datetime({ offset: true })

const title = z.string().trim().min(1).max(500)
const notes = z.string().max(100_000)
const manualProgress = z.number().min(0).max(1)

// ---- projects ----

/**
 * A project's identity colour is a SLOT, not a colour value. The six slots name the
 * `--color-project-N` tokens, which hold a different hex in light and dark; a stored hex could
 * only be right in one of the two schemes.
 *
 * The server assigns the first free slot when the project is created, so the client never sends
 * one -- the field stays writable because choosing your own is the obvious next step, and
 * accepting it now costs one line.
 */
export const projectColors = [
  'project-1',
  'project-2',
  'project-3',
  'project-4',
  'project-5',
  'project-6',
] as const
export const projectColor = z.enum(projectColors)
export type ProjectColor = z.infer<typeof projectColor>

export const createProjectBody = z
  .object({
    name: z.string().trim().min(1).max(200),
    color: projectColor.nullish(),
  })
  .strict()

export const updateProjectBody = z
  .object({
    name: z.string().trim().min(1).max(200),
    color: projectColor.nullable(),
    archived: z.boolean(),
  })
  .partial()
  .strict()

export const projectResponse = z
  .object({
    id: z.uuid(),
    workspaceId: z.uuid(),
    name: z.string(),
    color: projectColor.nullable(),
    isInbox: z.boolean(),
    rank: z.string(),
    archivedAt: instant.nullable(),
    createdAt: instant,
  })
  .strict()

/**
 * A project as the project LIST returns it: the stored row plus the one number a list of
 * destinations needs, `openTasks` -- tasks that are neither done nor cancelled nor deleted.
 * Create and update keep returning a bare `projectResponse`: they answer about one project the
 * caller just changed, not about a list, and a count there would be a second thing to keep
 * consistent. Modelled on `todayTaskResponse` / `completedTaskResponse`, which extend
 * `taskResponse` the same way with what their view needs.
 */
export const projectListItem = projectResponse
  .extend({ openTasks: z.number().int().nonnegative() })
  .strict()

// ---- tasks ----

// Rank is server-computed: neither create nor update accepts one.
export const createTaskBody = z
  .object({
    projectId: z.uuid(),
    parentId: z.uuid().nullish(),
    title,
    notes: notes.nullish(),
    // Backlog by default so that capturing an idea costs nothing (spec section 6.3).
    status: taskStatus.default('backlog'),
    scheduledOn: calendarDate.nullish(),
    dueAt: instant.nullish(),
    manualProgress: manualProgress.nullish(),
  })
  .strict()

// Deliberately omits parentId, projectId and rank: reparenting and reordering go through the
// move endpoint, which enforces cycle detection, the depth limit and project-id cascading.
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

// The client reports the neighbours the task lands between; the server computes the rank.
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

// ---- today ----

// Display order. The precedence between segments (a task matching several belongs to exactly one:
// overdue, then today, then in_progress) is hard-coded in the CASE of `listToday`'s SQL, NOT derived
// from this array. Change the two together.
export const TODAY_SEGMENTS = ['overdue', 'today', 'in_progress'] as const
export const todaySegment = z.enum(TODAY_SEGMENTS)
export type TodaySegment = z.infer<typeof todaySegment>

export const todayTaskResponse = taskResponse
  .extend({
    projectName: z.string(),
    // The breadcrumb shows `project > parent`; a root task has no parent half.
    parentTitle: z.string().nullable(),
    segment: todaySegment,
  })
  .strict()
export type TodayTaskResponse = z.infer<typeof todayTaskResponse>

// The "what I finished" list. `completedOn` is the calendar day in the user's timezone, decided
// by the server; the list arrives newest first and the client only partitions it by that field.
export const completedTaskResponse = taskResponse
  .extend({
    projectName: z.string(),
    parentTitle: z.string().nullable(),
    completedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict()
export type CompletedTaskResponse = z.infer<typeof completedTaskResponse>

// ---- 做到哪儿了 ----

/**
 * One project's line in 做到哪儿了: COUNTS AND MOVEMENT, NEVER A RATIO.
 *
 * There is deliberately no percentage and no `progress` field. Rollup is M3 and nothing in the
 * codebase writes `manual_progress`, so a ratio here would be a number the backend cannot
 * honour -- a bar drawn against a column that is null for every row in the database. What a
 * person can act on is movement: finished this week, left to do, and how long the line has been
 * quiet. The server decides the week and the day in the USER's timezone, exactly as
 * `completedTaskResponse.completedOn` does; the client only formats them.
 */
export const projectMovementResponse = z
  .object({
    projectId: z.uuid(),
    projectName: z.string(),
    doneThisWeek: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(),
    /**
     * Still open and already past its deadline, counted the same way the `overdue` segment of
     * `today` is: `due_at` before the start of the user's day. It lives here rather than on a
     * second endpoint because it is the fourth number the project header banner shows and the
     * other three are already in this one query.
     */
    overdue: z.number().int().nonnegative(),
    // Null when the project has no logged activity at all, which is only ever an empty project.
    lastActivityOn: calendarDate.nullable(),
    quietDays: z.number().int().nonnegative().nullable(),
  })
  .strict()
export type ProjectMovementResponse = z.infer<typeof projectMovementResponse>

// ---- search ----

/**
 * Newest 50 matches. No paging: search is "take me to the one I mean", and a query that returns
 * more than fifty rows is better retyped than scrolled.
 */
export const SEARCH_LIMIT = 50

/** A match carries enough context to act on without opening it: project, parent, status. */
export const searchTaskResponse = taskResponse
  .extend({
    projectName: z.string(),
    // Same breadcrumb as the today and completed lists: `project > parent`.
    parentTitle: z.string().nullable(),
    // Archived projects ARE searched (archiving is not deletion), so a result says so rather
    // than presenting a set-aside task as live work.
    projectArchived: z.boolean(),
  })
  .strict()
export type SearchTaskResponse = z.infer<typeof searchTaskResponse>

// ---- events ----

// There is intentionally no event type for reordering: a pure rank change is not logged
// (spec section 9.1), or tidy-ups would flood the log and poison last_activity_at.
export const TASK_EVENT_TYPES = [
  'created',
  'status_changed',
  'due_changed',
  'scheduled_changed',
  'moved',
  'title_changed',
  'notes_changed',
  'progress_set',
  'deleted',
  'restored',
] as const
export const taskEventType = z.enum(TASK_EVENT_TYPES)
export type TaskEventType = z.infer<typeof taskEventType>

export const taskEventResponse = z
  .object({
    id: z.uuid(),
    taskId: z.uuid(),
    actorUserId: z.uuid(),
    type: taskEventType,
    // Only the before/after values of the changed fields, never a row snapshot.
    payload: z.record(z.string(), z.unknown()),
    source: z.string(),
    occurredAt: instant,
  })
  .strict()

export type CreateProjectBody = z.infer<typeof createProjectBody>
export type UpdateProjectBody = z.infer<typeof updateProjectBody>
export type ProjectResponse = z.infer<typeof projectResponse>
export type ProjectListItem = z.infer<typeof projectListItem>
export type CreateTaskBody = z.infer<typeof createTaskBody>
export type UpdateTaskBody = z.infer<typeof updateTaskBody>
export type MoveTaskBody = z.infer<typeof moveTaskBody>
export type TaskResponse = z.infer<typeof taskResponse>
export type TaskEventResponse = z.infer<typeof taskEventResponse>
