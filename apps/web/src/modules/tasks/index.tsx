import type { WorkspaceModule } from '../../shell/contract'
import { topPage } from '../../shell/layout'
import { inboxOf, projectsQuery } from '../../shell/projects'
import { projectTasksQuery } from './api'
import {
  NewTaskAction,
  PROJECT_VIEWS,
  ProjectNumbers,
  ProjectTasks,
} from './components/ProjectBlock'
import { ProjectLead, ProjectRowFacts, ProjectTileFacts } from './components/ProjectFacts'
import { OpenTaskCount, TaskStatusLine, TodayCount } from './components/TaskKind'
import { TodayDate, TodayGlance } from './components/TodayGlance'
import { useInboxCapture, useTaskEntries, useTaskHits } from './hooks/contributions'
import { TASKS_ID, taskPage } from './logic/id'
import { TASK_KEYS } from './logic/keys'
import { openTasksOf } from './logic/openTasks'
import { OpenTask } from './pages/OpenTask'
import { Review } from './pages/Review'
import { Today } from './pages/Today'

// Today and Review live here, not in the shell: they are defined by task semantics.

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
      icon: (
        <>
          <circle cx="11" cy="11" r="7.5" />
          <path d="M11 5.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" stroke="none" />
        </>
      ),
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
    { path: 'today', element: <Today />, handle: topPage('Today') },
    { path: 'review', element: <Review />, handle: topPage('Review') },
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
    RowFacts: ProjectRowFacts,
    TileFacts: ProjectTileFacts,
    Lead: ProjectLead,
    count: openTasksOf,
    contents: async (qc, projectId) => {
      const { tasks } = await qc.fetchQuery(projectTasksQuery(projectId))
      return tasks.length === 0 ? null : `${tasks.length} tasks`
    },
  },
  keys: TASK_KEYS,
  // No page of its own: a task's address opens its tree, where its parent and siblings are.
  relations: [{ type: 'task', kind: 'Task', to: taskPage }],
}
