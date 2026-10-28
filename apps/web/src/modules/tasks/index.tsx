import type { TaskId } from '@ctws/contracts'
import type { WorkspaceModule } from '../../shell/contract'
import { topPage } from '../../shell/layout'
import { patchTask, projectTasksQuery, taskKeys } from './api'
import { PROJECT_VIEWS, ProjectTasks } from './components/ProjectBlock'
import { openOf, PersonTaskRow } from './components/PersonTaskRow'
import { ProjectOutline } from './components/ProjectOutline'
import { ProjectCardFacts, ProjectMoved, useProjectOrder } from './components/ProjectFacts'
import { OpenTaskCount, TaskStatusLine, TodayCount } from './components/TaskKind'
import { useInboxCapture, useTaskEntries, useTaskHits } from './hooks/contributions'
import { TASKS_ID, taskPage } from './logic/id'
import { describeTaskChange } from './logic/describeChange'
import { TASK_KEYS } from './logic/keys'
import { TaskFact, TaskMark } from './components/TaskFacts'
import { ReadyBlock } from './pages/today/ReadyBlock'
import { WeekBlock } from './pages/today/WeekBlock'
import { openTasksOf } from './logic/openTasks'
import { NewTask } from './components/NewTask'
import { OpenTask } from './pages/OpenTask'
import { Review } from './pages/Review'
import { Today } from './pages/Today'
import { NowWidget } from './widgets/Now'

// Today and Review live here, not in the shell: they are defined by task semantics.

export const taskModule: WorkspaceModule = {
  id: TASKS_ID,
  label: 'Tasks',
  pages: [
    {
      id: 'today',
      to: '/today',
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
    { id: 'review', to: '/review', label: 'Review', end: false, chord: 'review' },
  ],
  // Tasks have no list page of their own yet: they are dealt with on Today and live in their
  // projects, so that is where this kind's row goes.
  kind: {
    label: 'Tasks',
    to: '/today',
    Count: OpenTaskCount,
    Status: TaskStatusLine,
    order: 10,
  },
  // Today and Review are pages across kinds, at the root (FR-019); a task's own address stays here.
  places: [
    { path: '/today', element: <Today />, handle: topPage('Today') },
    { path: '/review', element: <Review />, handle: topPage('Review') },
  ],
  routes: [{ path: ':id', element: <OpenTask /> }],
  capture: { kind: 'task', useTarget: useInboxCapture },
  creates: [{ kind: 'task', key: 't', label: 'Task', Dialog: NewTask }],
  search: { useHits: useTaskHits },
  chords: [
    { id: 'today', key: 't', label: 'Today', resolve: () => '/today', order: 10 },
    {
      id: 'review',
      key: 'v',
      label: 'Review',
      resolve: () => '/review',
      order: 20,
      was: 'g r',
    },
  ],
  calendar: {
    label: 'Tasks',
    useEntries: useTaskEntries,
    // `planned` and `due` are the words too. A task opens in its project, where every task is.
    show: (e) => ({
      to: e.projectId ? `/projects/${e.projectId}?task=${e.id}` : taskPage(e.id),
      label: e.kind,
    }),
  },
  widgets: [{ place: 'now', Component: NowWidget }],
  // A person's page draws the tasks linked to them by when they are due (FR-061).
  person: { Linked: { kind: 'task', Row: PersonTaskRow, count: openOf } },
  project: {
    Main: { Component: ProjectTasks, views: PROJECT_VIEWS },
    Card: { Moved: ProjectMoved, Facts: ProjectCardFacts, useOrder: useProjectOrder },
    Outline: ProjectOutline,
    count: openTasksOf,
    counts: ['task'],
    contents: async (qc, projectId) => {
      const { tasks } = await qc.fetchQuery(projectTasksQuery(projectId))
      return tasks.length === 0 ? null : `${tasks.length} tasks`
    },
  },
  keys: TASK_KEYS,
  // No page of its own: a task's address opens its tree, where its parent and siblings are.
  today: [
    { id: 'ready', order: 20, Block: ReadyBlock },
    { id: 'week', order: 30, Block: WeekBlock },
  ],
  relations: [
    {
      type: 'task',
      kind: 'Task',
      plural: 'Tasks',
      to: taskPage,
      Mark: TaskMark,
      Fact: TaskFact,
      describeChange: describeTaskChange,
      finish: (id) => patchTask(id as TaskId, { status: 'done' }),
    },
  ],
  // A task row names its project, and search says whether that project is archived.
  reads: [{ queryKey: taskKeys.all, of: ['task', 'project'] }],
}
