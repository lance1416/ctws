import { useQuery, useQueryClient } from '@tanstack/react-query'
import { refreshQueries } from '../../platform/http/refresh'
import type { CaptureTargetState, SearchHit, WorkspaceModule } from '../../shell/contract'
import { inboxOf, projectsQuery, useProjects } from '../../shell/projects'
import { ProjectRail } from '../../shell/rows'
import { projectTasksQuery, taskCalendarQuery, taskSearchQuery } from './api/queries'
import { createTask } from './api/tasks'
import { ProjectFacts, ProjectLead } from './components/ProjectFacts'
import { StatusMark } from './components/StatusMark'
import { revealHref, taskCrumb } from './crumb'
import { TASKS_ID, taskPage } from './id'
import { OpenTask } from './pages/OpenTask'
import { Review } from './pages/Review'
import { Today } from './pages/Today'
import { NewTaskAction, PROJECT_VIEWS, ProjectNumbers, ProjectTasks } from './projectBlock'
import { OpenTaskCount, TaskStatusLine, TodayCount, TodayDate, TodayGlance } from './widgets'

// Today and Review live here, not in the shell: they are defined by task semantics.

/** This module's dated things: a plan day and a deadline day, both decided by the server. */
function useTaskEntries(range: { from: string; to: string }) {
  const result = useQuery(taskCalendarQuery(range))
  return { entries: result.data ?? [], isError: result.isError }
}

/** Quick capture lands in the workspace inbox, found by its `isInbox` flag, never by name. */
function useInboxCapture(): CaptureTargetState {
  const qc = useQueryClient()
  const projects = useProjects()
  const inbox = projects.data ? inboxOf(projects.data) : undefined
  return {
    target: inbox
      ? {
          name: inbox.name,
          to: `/projects/${inbox.id}`,
          submit: async (title: string) => {
            await createTask({ projectId: inbox.id, title })
            // Not awaited: the box is free for the next line once the server has this one, and
            // what is typed while the list is read again is that next line.
            void refreshQueries(qc, [projectTasksQuery(inbox.id).queryKey])
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
  const rows = results.data ?? []
  const hits: SearchHit[] = rows.map((t) => ({
    id: t.id,
    // `?reveal=` makes `TaskTree` unfold the ancestors and focus the row, which may be folded away.
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

export const taskModule: WorkspaceModule = {
  id: TASKS_ID,
  label: 'Tasks',
  pages: [
    {
      id: 'today',
      to: taskPage('today'),
      label: 'Today',
      end: true,
      chord: 'today',
      Count: TodayCount,
    },
    // Done is a view of Review, not a page of its own: both answer what I did.
    { id: 'review', to: taskPage('review'), label: 'Review', end: false, chord: 'review' },
  ],
  // Tasks have no list page of their own yet: they are dealt with on Today and live in their
  // projects, so that is where this kind's row goes.
  kind: {
    label: 'Tasks',
    to: taskPage('today'),
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
    { id: 'today', key: 't', label: 'Go to Today', resolve: () => taskPage('today'), order: 10 },
    { id: 'review', key: 'r', label: 'Go to Review', resolve: () => taskPage('review'), order: 40 },
    {
      id: 'inbox',
      key: 'i',
      label: 'Go to Inbox',
      // Read from the cache at keypress time: the rail has loaded ['projects'] by then.
      resolve: ({ queryClient }) => {
        const projects = queryClient.getQueryData(projectsQuery().queryKey)
        const inbox = projects ? inboxOf(projects) : undefined
        return inbox ? `/projects/${inbox.id}` : null
      },
      order: 40,
    },
  ],
  calendar: {
    label: 'Tasks',
    useEntries: useTaskEntries,
    // `planned` and `due` are the words too.
    show: (e) => ({ to: '/tasks/today', label: e.kind }),
  },
  widgets: [
    {
      id: 'today',
      label: 'Today',
      to: taskPage('today'),
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
        [
          '← →',
          'Collapse / expand (once collapsed, ← goes to the parent; once expanded, → goes to the first child)',
        ],
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
  // No page of its own: a task's address opens its tree, where its parent and siblings are.
  relations: [{ type: 'task', kind: 'Task', to: taskPage }],
}
