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
    /**
     * `todo` BY DEFAULT, never `backlog`.
     *
     * The rollup drops a `backlog` node BEFORE looking at its children, so a `backlog`
     * default would make a parent report no progress even with every child finished. Pinned in
     * `apps/api/tests/rollup.test.ts`.
     *
     * `backlog` still exists because capturing a line has to cost nothing -- an idea that is only
     * recorded should not drag a number down -- as a bucket a person puts something INTO.
     */
    status: taskStatus.default('todo'),
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

/**
 * ROLLUP METRICS, returned beside the flat task list rather than embedded in
 * each task: they are DERIVED from the whole subtree, not stored on the row, and keeping them
 * apart stops anyone from PATCHing one back.
 */
export const rollupResponse = z
  .object({
    /**
     * 0..1, or null for a task the rollup EXCLUDES (`backlog` and `cancelled`). Null is not zero:
     * "not counted" and "nothing done" are different answers, and the mean depends on the
     * difference.
     */
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
    /** The most recent logged change anywhere in the subtree, or null. */
    lastActivityAt: instant.nullable(),
  })
  .strict()
export type RollupResponse = z.infer<typeof rollupResponse>

/** Keyed by task id, one entry per task in the same response's `tasks`. */
export const rollupsResponse = z.record(z.uuid(), rollupResponse)

/**
 * THE WEEKLY REVIEW. What HAPPENED in a window, read off the event log and
 * grouped by project -- as against Done, which lists what is finished right now.
 */
export const reviewTask = z.object({ id: z.uuid(), title: z.string(), at: instant }).strict()

export const reviewProject = z
  .object({
    projectId: z.uuid(),
    projectName: z.string(),
    /** Moved INTO done inside the window. */
    finished: z.array(reviewTask),
    /** Moved INTO in_progress: the week's starts, which a recount of a week needs as much. */
    started: z.array(reviewTask),
    /** Moved INTO cancelled. Dropping something is a decision, and it belongs in the account. */
    dropped: z.array(reviewTask),
  })
  .strict()

export const reviewResponse = z
  .object({
    /** The window's own bounds, as calendar days in the account's zone. */
    from: calendarDate,
    to: calendarDate,
    projects: z.array(reviewProject),
  })
  .strict()
export type ReviewResponse = z.infer<typeof reviewResponse>

/**
 * The window a calendar asks for. Inclusive at both ends.
 *
 * BOUNDED, and not as tidiness: a window is how much work a request asks a module for, and a
 * recurring thing has no last occurrence. `FREQ=DAILY` over a thousand years is 365,242
 * occurrences and most of a second of one core -- measured -- from one request anybody can send.
 * A grid shows six weeks and the longest view anyone has asked for is a year, so a year and a bit
 * is room to spare.
 */
export const MAX_CALENDAR_SPAN_DAYS = 370

/**
 * And WHERE a window may sit, not only how wide it is.
 *
 * A window in year 9000 is as expensive as a wide one: a series is expanded from its own start
 * forward to the window, so the distance is the work. Nothing in this app draws a calendar
 * outside a human range, and a meeting cannot start outside one either.
 */
const CALENDAR_FLOOR = '1970-01-01'
const CALENDAR_CEILING = '2200-12-31'

/**
 * THE ONE PLACE A DATE WINDOW IS BOUNDED, so the endpoints that take one cannot drift apart.
 *
 * They did: `calendarQuery` was given a span and a range and `meetingListQuery` -- the same
 * question with the days named differently -- kept neither, so the walk one refused the other
 * still allowed. A shared check is the only version of this that stays true.
 *
 * Both ends optional, because some windows have defaults; a half-given window is bounded on the
 * half it has.
 */
export function windowIsBounded(q: {
  from?: string | undefined
  to?: string | undefined
}): boolean {
  if (q.from && (q.from < CALENDAR_FLOOR || q.from > CALENDAR_CEILING)) return false
  if (q.to && (q.to < CALENDAR_FLOOR || q.to > CALENDAR_CEILING)) return false
  if (!q.from || !q.to) return true
  if (q.to < q.from) return false
  return (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 <= MAX_CALENDAR_SPAN_DAYS
}

/** What a refused window is told. */
export const WINDOW_REFUSED = 'that is not a window anybody is looking at'

export const reviewQuery = z
  .object({ from: calendarDate.optional(), to: calendarDate.optional() })
  .strict()
  // The same bound, for the same reason: this reads the event log over a window, and a window
  // nobody is looking at is a scan nobody asked for.
  .refine(windowIsBounded, { message: WINDOW_REFUSED, path: ['to'] })

/**
 * ONE DATED THING, as a module hands it to the calendar.
 *
 * Deliberately thin: an id, the DAY it falls on, what to call it, where to go, and which project
 * it belongs to. The shell draws the grid and knows nothing about what a deadline is or how it
 * differs from a day you mean to finish a book -- `kind` is the module's own word, shown as given.
 *
 * The DAY is computed by the server in the account's zone, like today / completed / review. A
 * client that turned an instant into a day would put a 23:00 deadline on the wrong square for
 * half the world.
 */
export const calendarEntry = z
  .object({
    id: z.string(),
    /** The calendar day it sits on, in the account's zone. */
    day: calendarDate,
    title: z.string(),
    /** Where clicking it goes, inside the app. */
    to: z.string(),
    /** The module's own word for what this date is: “Due”, “Plan”, “Finish by”. */
    kind: z.string(),
    /**
     * The time of day, when the thing HAS one, formatted by the server in the account's
     * zone. A deadline has an instant too but it is not what a deadline is about; a meeting is at
     * a time, and a grid that showed only the day would be hiding the useful half.
     *
     * It is also what a square sorts by, so the morning really is above the afternoon.
     */
    time: z.string().nullable(),
    /**
     * The zone this thing was agreed in, as people say it (“EDT”), and only when it is NOT the
     * account's. A meeting at 09:00 in Toronto shows on your own clock, which answers when to be
     * there; this is how it still says what was actually agreed.
     */
    zone: z.string().nullable(),
    projectId: z.uuid().nullable(),
    projectName: z.string().nullable(),
  })
  .strict()
export type CalendarEntry = z.infer<typeof calendarEntry>

/**
 * What a module's `/calendar` answers with.
 *
 * Named once: a response shape written out in three route files is one that can be written
 * three ways.
 */
export const calendarEntriesResponse = z.object({ entries: z.array(calendarEntry) }).strict()

/**
 * What each day in a window is called in the lunar calendar, for the grid's squares.
 *
 * The SHELL asks for this, not a module: a day's own name belongs to the day. It is one request
 * per month view and a few hundred bytes.
 */
export const calendarDaysResponse = z.object({ days: z.record(calendarDate, z.string()) }).strict()

export const calendarQuery = z
  .object({ from: calendarDate, to: calendarDate })
  .strict()
  .refine(windowIsBounded, { message: WINDOW_REFUSED, path: ['to'] })

export type CalendarQuery = z.infer<typeof calendarQuery>

/**
 * ONE TASK WAITING FOR ANOTHER. A reference to the task at the other end, carrying enough
 * to name it on a row -- including its PROJECT, because a dependency may cross one.
 */
export const dependencyRef = z
  .object({
    id: z.uuid(),
    title: z.string(),
    projectId: z.uuid(),
    projectName: z.string(),
    /** Finished blockers are kept in the detail lists and left out of what a row shows. */
    done: z.boolean(),
  })
  .strict()
export type DependencyRef = z.infer<typeof dependencyRef>

export const dependencyLists = z
  .object({ blockedBy: z.array(dependencyRef), blocks: z.array(dependencyRef) })
  .strict()

export const addDependencyBody = z.object({ blockerId: z.uuid() }).strict()

/** Keyed by the WAITING task's id; only what is still in the way. */
export const blockersResponse = z.record(z.uuid(), z.array(dependencyRef))

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
    /**
     * What is still in the way, unfinished blockers only. ON THIS RESPONSE and not in a
     * parallel map, because this is the page the feature exists for: Today stops answering what
     * is due and answers what can be worked on, which is a property of each row.
     */
    blockedBy: z.array(dependencyRef),
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

/**
 * The finished list, and whether it is ALL of it.
 *
 * The list is capped -- it answers "what did I do lately", and the archive is the weekly review,
 * which takes any window. `truncated` is how the page can say so instead of letting the oldest
 * day simply stop, which reads as work that went missing.
 */
export const completedResponse = z
  .object({ tasks: z.array(completedTaskResponse), truncated: z.boolean() })
  .strict()
export type CompletedResponse = z.infer<typeof completedResponse>

// ---- Movement ----

/**
 * One project's line of Movement: COUNTS, NEVER A RATIO.
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
    /** The day the next deadline still standing falls on, in the user's zone; null when none. */
    nextDueOn: calendarDate.nullable(),
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

// There is intentionally no event type for reordering: a pure rank change is not logged, or
// tidy-ups would flood the log and poison last_activity_at.
export const TASK_EVENT_TYPES = [
  'created',
  'status_changed',
  'due_changed',
  'scheduled_changed',
  'moved',
  'title_changed',
  'notes_changed',
  'progress_set',
  // A dependency arrived or left. Recorded on the WAITING task: it is the one whose situation
  // changed, and its history is where someone looks to ask why it sat still.
  'dependency_added',
  'dependency_removed',
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
