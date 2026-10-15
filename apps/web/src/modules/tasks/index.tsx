import { revealHref, taskCrumb } from './crumb'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useEffect, useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { inboxOf, projectsQuery, useProjects } from '../../shell/projects/api'
import {
  completedQuery,
  movementQuery,
  projectTasksQuery,
  taskCalendarQuery,
  taskSearchQuery,
  todayQuery,
} from './api/queries'
import { createTask } from './api/tasks'
import { refreshQueries } from '../../platform/http/refresh'
import { CreateTaskDialog } from './components/CreateTaskDialog'
import { ProjectFacts, ProjectLead } from './components/ProjectFacts'
import { TaskBoard } from './components/TaskBoard'
import { isOverlayOpen } from '../../platform/keyboard/overlayState'
import { ProjectRail } from '../../shell/rows/RowParts'
import { PanelEmpty } from '../../platform/ui/Panel'
import { StatusMark } from './components/StatusMark'
import { TaskTree } from './components/TaskTree'
import { dayPhrase, todayIn } from '../../platform/time/dates'
import { useShortcutsEnabled } from '../../platform/keyboard/enabled'
import { isBareKey, isTypingTarget } from '../../platform/keyboard/keys'
import { OpenTask } from './pages/OpenTask'
import { Review } from './pages/Review'
import { Today } from './pages/Today'
import { useTimeZone } from '../../shell/auth/useMe'
import type { CaptureTargetState, SearchHit, WorkspaceModule } from '../../shell/contract'
import { useInlineEdit } from '../../platform/ui/useInlineEdit'
import { textbox } from '../../platform/ui/formStyles'
import { TASKS_ID } from './id'
import { useNow } from '../../platform/time/useNow'

/**
 * THE TASK MODULE.
 *
 * “Today”and “Done”live here, not in the shell: they are defined by task semantics (overdue,
 * scheduled, in progress). A cross-module "today" is a separate idea and is not borrowed against
 * here. The shell only offers the SLOT.
 */
const ID = TASKS_ID
const at = (page: string) => `/${ID}/${page}`

/** The rail's count for Today. Shares `todayQuery` with the page that owns it. */
function TodayCount() {
  const today = useQuery(todayQuery())
  // Only tasks that are actually on today's plate; the rail must not claim work that is not due.
  const count = today.data?.length ?? null
  if (count === null || count <= 0) return null
  return (
    <span data-count className="ml-auto pl-1 text-xs text-ink-muted">
      {count}
    </span>
  )
}

/** Things' count for tasks: how many are open across every line of work, zero included. */
function OpenTaskCount() {
  const projects = useProjects()
  if (!projects.data) return null
  const open = projects.data.filter((p) => !p.archivedAt).reduce((n, p) => n + p.openTasks, 0)
  return <span data-count>{open} open</span>
}

/** What is pressing among them, from Today's own list: what is late and what is planned. */
function TaskStatusLine() {
  const today = useQuery(todayQuery())
  const late = today.data?.filter((t) => t.segment === 'overdue').length ?? 0
  const planned = today.data?.filter((t) => t.segment === 'today').length ?? 0
  const parts = [late > 0 && `${late} overdue`, planned > 0 && `${planned} planned for today`]
  const line = parts.filter(Boolean).join(', ')
  return line ? <span data-status>{line}</span> : null
}

/** This module's dated things: a plan day and a deadline day, both decided by the server. */
function useTaskEntries(range: { from: string; to: string }) {
  const result = useQuery(taskCalendarQuery(range))
  return { entries: result.data ?? [], isError: result.isError }
}

/**
 * THE WORKBENCH'S TODAY: a glance, not a second Today.
 *
 * Three counts -- what is late, what is planned, what is done -- each the way to where it is
 * dealt with, then what is in progress, one line each. No dates, no controls: everything you can
 * DO with a task is one click away on the page the heading links to.
 */
function TodayGlance() {
  const today = useQuery(todayQuery())
  // The same entry the Done page and Today's own Done section read.
  const completed = useQuery(completedQuery())
  const localToday = todayIn(useTimeZone(), useNow())

  if (today.isError) {
    return (
      <p role="alert" className="px-2 py-1.5 text-sm text-danger">
        Couldn't load today's tasks
      </p>
    )
  }
  const rows = today.data ?? []
  const overdue = rows.filter((t) => t.segment === 'overdue').length
  const planned = rows.filter((t) => t.segment === 'today').length
  const done = (completed.data?.tasks ?? []).filter((t) => t.completedOn === localToday).length
  const doing = rows.filter((t) => t.status === 'in_progress')
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1">
        {/* Late is the one that bites, in the miss colour -- and only when there is any. */}
        <GlanceCount
          to={at('today')}
          n={overdue}
          word="overdue"
          tone={overdue > 0 ? 'text-missed' : 'text-ink-subtle'}
        />
        <GlanceCount to={at('today')} n={planned} word="planned" tone="text-ink" />
        <GlanceCount to={`${at('review')}?view=done`} n={done} word="done" tone="text-ink-subtle" />
      </div>
      <p className="mb-1 px-2 text-xs text-ink-subtle">In progress</p>
      {today.isSuccess && doing.length === 0 ? (
        <PanelEmpty>Nothing in progress</PanelEmpty>
      ) : (
        <ul className="min-w-0">
          {doing.map((t) => (
            <li key={t.id}>
              <Link
                to={revealHref(t.projectId, t.id)}
                className="flex min-h-10 min-w-0 items-stretch gap-3 hover:bg-hover"
              >
                <ProjectRail projectId={t.projectId} />
                <span className="flex shrink-0 items-center">
                  <StatusMark status={t.status} />
                </span>
                <span className="flex min-w-0 items-baseline gap-2 self-center">
                  <span className="truncate text-ink">{t.title}</span>
                  {/* The thread is the project's colour; its name is here, so the colour is
                      never the only thing saying which line of work this is (WCAG 1.4.1). */}
                  <span className="max-w-[40%] shrink-0 truncate text-sm text-ink-subtle">
                    {t.projectName}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** One count: the number large, its word beside it, the whole of it the way there. */
function GlanceCount({ to, n, word, tone }: { to: string; n: number; word: string; tone: string }) {
  return (
    <Link to={to} className={`flex items-baseline gap-2 px-2 py-0.5 hover:bg-hover ${tone}`}>
      <span className="text-xl font-medium tabular-nums">{n}</span> <span>{word}</span>
    </Link>
  )
}

/** The Today card's note: which day it is, in the account's zone. */
function TodayDate() {
  const timeZone = useTimeZone()
  const now = useNow()
  return (
    <span className="text-sm text-ink-subtle">
      {new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone,
      }).format(now)}
    </span>
  )
}

/**
 * Quick capture's destination: the workspace inbox. Found by the `isInbox` flag, never by name.
 * The shell asks for this once per render and nothing here costs the typist a keystroke.
 */
function useInboxCapture(): CaptureTargetState {
  const qc = useQueryClient()
  // Shares the ['projects'] cache entry with every other reader, so capture costs no extra request.
  const projects = useProjects()
  const inbox = projects.data ? inboxOf(projects.data) : undefined
  return {
    target: inbox
      ? {
          name: inbox.name,
          to: `/projects/${inbox.id}`,
          submit: async (title: string) => {
            await createTask({ projectId: inbox.id, title })
            // Awaited, so the input stays busy until the list that now holds the line is refreshed.
            await refreshQueries(qc, [projectTasksQuery(inbox.id).queryKey])
          },
        }
      : null,
    missing: projects.isSuccess && !inbox,
    unavailable: projects.isError,
  }
}

/** This module's half of federated search: titles and notes, across every project. */
function useTaskHits(query: string) {
  const results = useQuery({
    ...taskSearchQuery(query),
    enabled: query.length > 0,
  })
  const rows = query.length > 0 ? (results.data ?? []) : []
  const hits: SearchHit[] = rows.map((t) => ({
    id: t.id,
    // Choosing a result goes to the task's project with `?reveal=<id>`, which `TaskTree` consumes
    // by unfolding the ancestors and putting focus on that row. Routing alone is not enough: the
    // row may sit in a collapsed subtree, and arriving at a folded parent is the failure this is
    // for.
    to: revealHref(t.projectId, t.id),
    title: t.title,
    meta: (
      <>
        {taskCrumb(t)}
        {t.projectArchived && ' · archived'}
      </>
    ),
    mark: <StatusMark status={t.status} />,
    rail: <ProjectRail projectId={t.projectId} />,
  }))
  return { hits, isError: results.isError, isSuccess: results.isSuccess }
}

/**
 * THE FOUR NUMBERS in the project header banner: Open, Done this week, Overdue, Last activity.
 *
 * Every one of them is the SERVER's, from the one `movementQuery` entry that panel already
 * loads -- so a project page costs no extra request, and the banner cannot disagree with that
 * panel about the same line of work. Nothing is re-derived here: the week boundary, the overdue
 * boundary and the day count are all decided in the user's timezone by the query, and this only
 * formats them.
 *
 * NO RATIO AND NO BAR. There are four counts and a date, which are things that can move;
 * `manual_progress` is written by nothing in the codebase, so a percentage would be a number the
 * backend cannot cash.
 */
function ProjectNumbers({ projectId }: { projectId: string }) {
  const movement = useQuery(movementQuery())
  const timeZone = useTimeZone()
  const row = movement.data?.find((r) => r.projectId === projectId)
  /**
   * THE PROJECT'S OWN PROGRESS, derived here from the rollups the task list already carries --
   * no extra request, no extra column.
   *
   * A project is the parent of its root tasks, so it gets the SAME rule the fold gives a parent:
   * the mean of its direct children, skipping the ones the rollup excludes. A project whose roots
   * are all `backlog` or `cancelled` has no number, and shows none rather than a 0 that would read
   * as "nothing done".
   */
  const tasks = useQuery(projectTasksQuery(projectId))
  const progress = (() => {
    const data = tasks.data
    if (!data) return null
    const roots = data.tasks.filter((t) => t.parentId === null)
    const scored = roots.map((t) => data.rollups[t.id]?.progress).filter((p) => p != null)
    if (scored.length === 0) return null
    return scored.reduce((a, b) => a + b, 0) / scored.length
  })()
  const now = useNow()
  // Nothing rather than zeroes while the numbers are in flight, and nothing for an ARCHIVED
  // project: archiving sets a line of work aside, and the movement query leaves it out on purpose
  // rather than reporting that it has been quiet for forty days.
  if (!row) return null
  // The account's own calendar day, for reading the server's `lastActivityOn` back as a phrase.
  const today = todayIn(timeZone, now)
  const moved = row.lastActivityOn ? dayPhrase(row.lastActivityOn, today) : null
  /**
   * ONE SENTENCE, NOT FOUR TILES: "6 open, 1 overdue, 63% done. Last moved today."
   *
   * Open first, because it is what is left. Overdue only when there is any -- "0 overdue" is not
   * news -- and in the miss colour, the one number allowed a hue. Done as a percentage and NO BAR:
   * a 60% line and a 60% line nobody has touched for three weeks draw the same bar, and "Last
   * moved" is what tells them apart.
   */
  const parts: ReactNode[] = [`${row.remaining} open`]
  if (row.overdue > 0) parts.push(<span className="text-missed">{row.overdue} overdue</span>)
  // 0% is no more news than "0 overdue": a line with nothing done yet says how much is open.
  if (progress !== null && Math.round(progress * 100) > 0)
    parts.push(`${Math.round(progress * 100)}% done`)
  return (
    <p data-project-sentence className="mt-1.5 text-ink-muted tabular-nums">
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && ', '}
          {p}
        </Fragment>
      ))}
      .{' '}
      {moved
        ? `Last moved ${/^(Today|Yesterday)$/.test(moved) ? moved.toLowerCase() : moved}.`
        : 'Nothing has moved yet.'}
    </p>
  )
}

/**
 * THE TASK BLOCK'S OWN NEW BUTTON, in the block's head.
 *
 * It carries the `n` key with it. The key lives in the module rather than in the shell's table
 * because it needs a project to create into, so it exists exactly where that is true; it obeys
 * the same three guards every other single key obeys -- the off switch, "not while typing", and
 * "not under an open layer" -- and it is not a `g` chord, so it cannot collide with one.
 */
/** The two ways to look at the same rows. The first is the default. */
const PROJECT_VIEWS = [
  { id: 'list', label: 'List' },
  { id: 'board', label: 'Board' },
] as const

function NewTaskAction({ projectId }: { projectId: string }) {
  const [creating, setCreating] = useState(false)
  const shortcuts = useShortcutsEnabled()

  useEffect(() => {
    if (!shortcuts) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'n' || !isBareKey(e)) return
      if (isTypingTarget(e.target) || isOverlayOpen()) return
      e.preventDefault()
      setCreating(true)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [shortcuts])

  return (
    <>
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm text-ink-muted hover:bg-hover hover:text-ink"
      >
        New…
        <kbd
          aria-hidden="true"
          className="pointer-events-none rounded border border-rule px-1.5 text-xs leading-5 text-ink-subtle max-sm:hidden"
        >
          n
        </kbd>
      </button>
      {creating && <CreateTaskDialog projectId={projectId} onClose={() => setCreating(false)} />}
    </>
  )
}

/** The module's rows under a shell project: the tree, and the one input that adds a root task. */
function ProjectTasks({ projectId, view }: { projectId: string; view: string }) {
  const [title, setTitle] = useState('')
  const failureId = useId()
  const create = useMutation({
    mutationFn: (t: string) => createTask({ projectId, title: t, parentId: null }),
    meta: { awaits: [projectTasksQuery(projectId).queryKey] },
    onSuccess: () => setTitle(''),
  })

  const submit = () => {
    const t = title.trim()
    if (t && !create.isPending) create.mutate(t)
  }
  const titleKeys = useInlineEdit({ onCommit: submit })

  return (
    <>
      {/* THE FAST PATH, ALONE. New… used to sit right beside this box, which made the two ways
          in one control group and so made having two of them pointless -- whichever you reached
          for, you reached to the same place. The full form is the BLOCK's action now and lives in
          the block's head (`NewTaskAction`), where every block's "new" is. A line typed here and
          filed with Enter is this project's success criterion, so it keeps the position. */}
      {/* Where the rows' bodies start: past the margin (3.75 / 4.5rem), the thread and the body's
          gutter (8 / 14px), so the box reads as the first row's place. */}
      <div className="mb-1 ml-[71px] flex max-w-[52ch] flex-wrap items-center gap-2 pr-2 sm:ml-[89px]">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          {...titleKeys}
          placeholder="New task"
          aria-label="New task"
          aria-invalid={create.isError ? true : undefined}
          aria-describedby={create.isError ? failureId : undefined}
          // Inside the panel now, so it leads the rows rather than hanging under a page heading.
          // The border follows `aria-invalid` (see `textbox`), so the colour and the state the
          // screen reader is told cannot disagree.
          className={`min-w-0 flex-1 basis-[22ch] bg-sheet ${textbox}`}
        />
      </div>
      {/* THE FAILURE SITS UNDER ITS OWN BOX, inside the same block and at the same left
          edge, rather than as a line of page chrome below the whole control group. The typed
          title is still in the box: what was typed is the user's, not the request's. */}
      {create.isError && (
        <p id={failureId} role="alert" className="mt-1 ml-[71px] text-sm text-danger sm:ml-[89px]">
          Couldn't create. Press Enter to try again.
        </p>
      )}
      {/* The board is a VIEW of this block, not a page: the one-line box above stays, because
          capturing into this project is the same action whichever way the rows are drawn. */}
      {view === 'board' ? (
        <TaskBoard key={projectId} projectId={projectId} />
      ) : (
        <TaskTree key={projectId} projectId={projectId} />
      )}
    </>
  )
}

export const taskModule: WorkspaceModule = {
  id: ID,
  label: 'Tasks',
  pages: [
    { id: 'today', to: at('today'), label: 'Today', end: true, chord: 'today', Count: TodayCount },
    // Done is a VIEW of Review, not a page of its own: both answer what I did.
    { id: 'review', to: at('review'), label: 'Review', end: false, chord: 'review' },
  ],
  // Tasks have no list page of their own yet: they are dealt with on Today and live in their
  // projects, so that is where this kind's row goes.
  kind: {
    label: 'Tasks',
    to: at('today'),
    Count: OpenTaskCount,
    Status: TaskStatusLine,
    order: 10,
  },
  routes: [
    { path: 'today', element: <Today /> },
    { path: 'review', element: <Review /> },
    // After the pages: a static segment outranks `:id`, so `today` is never read as a task.
    { path: ':id', element: <OpenTask /> },
  ],
  capture: { useTarget: useInboxCapture },
  search: { useHits: useTaskHits },
  chords: [
    { id: 'today', key: 't', label: 'Go to Today', resolve: () => at('today'), order: 10 },
    { id: 'review', key: 'r', label: 'Go to Review', resolve: () => at('review'), order: 40 },
    {
      id: 'inbox',
      key: 'i',
      label: 'Go to Inbox',
      // Read from the cache at keypress time rather than through a hook: the inbox is a row in the
      // database, and the rail and the capture box have both already loaded ['projects'] by the
      // time anyone can press a key. Unresolved means "do nothing", exactly as before.
      resolve: ({ queryClient }) => {
        const projects = queryClient.getQueryData(projectsQuery().queryKey)
        const inbox = projects ? inboxOf(projects) : undefined
        return inbox ? `/projects/${inbox.id}` : null
      },
      order: 40,
    },
  ],
  calendar: { label: 'Tasks', useEntries: useTaskEntries },
  widgets: [
    {
      id: 'today',
      label: 'Today',
      to: at('today'),
      Component: TodayGlance,
      Aside: TodayDate,
      order: 10,
      span: 6,
    },
  ],
  project: {
    Block: { Component: ProjectTasks, views: PROJECT_VIEWS, Action: NewTaskAction },
    Headline: ProjectNumbers,
    Facts: ProjectFacts,
    Lead: ProjectLead,
    contents: async (qc, projectId) => {
      const { tasks } = await qc.fetchQuery(projectTasksQuery(projectId))
      return tasks.length === 0 ? null : `${tasks.length} tasks`
    },
  },
  help: [
    // `n` needs a project to create into, so it exists only on a project page.
    { title: 'On a project page', keys: [['n', 'Open the New dialog']] },
    {
      title: 'In the task tree (with a row focused)',
      keys: [
        ['↑ ↓ / j k', 'Move between rows'],
        ['← →', 'Collapse / expand (when collapsed, jump to the parent / first child)'],
        ['Home End', 'First row / last row'],
        ['Tab', 'Leave the tree (the whole tree is one tab stop)'],
        ['Enter', 'Open the details'],
        ['Shift+Enter', 'Add a sibling'],
        ['Alt+Enter', 'Add a subtask'],
        ['Alt+↑ Alt+↓', 'Move this row up / down'],
        ['Alt+← Alt+→', 'Outdent / indent'],
        ['s', 'Start / pause'],
        ['x', 'Complete / reopen'],
      ],
    },
    {
      title: 'On Today (with a row focused)',
      keys: [
        ['s', 'Start / pause'],
        ['x', 'Complete / reopen'],
        ['Enter', 'Open the details'],
      ],
    },
  ],
  // No page of its own: a task is read IN ITS TREE, where its siblings, its parent and its
  // dependencies are. Its address finds the tree and opens it there.
  relations: [{ type: 'task', kind: 'Task', to: (id) => at(id) }],
}
