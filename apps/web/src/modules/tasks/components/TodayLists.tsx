import type { ReadyTaskResponse, TaskId, TodayTaskResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import { FlagIcon, InProgressIcon, PLACE_ICON, ToDoIcon } from '../../../platform/ui/icons'
import { StatusMark } from '../../../platform/ui/StatusMark'
import type { InspectorList } from '../../../shell/contract'
import { useAccountToday, useTimeZone } from '../../../shell/auth'
import { ListHead, useCloseInspector, useInspectorGo } from '../../../shell/inspector'
import { ProjectSquare, useEveryProject } from '../../../shell/projects'
import { readyQuery, todayQuery } from '../api'
import { useTaskActions } from '../hooks/useTaskActions'
import { todaySegments } from '../logic/today'
import { DoneButton, DueChip } from '../pages/today/TaskLine'
import { MoveAllMenu, PlanButtons } from '../pages/today/planParts'
import { ProgressSquare } from './ProgressSquare'

/** A Today block's "All N", a row at its foot. */
export const ALL_ROW =
  'flex h-9 w-full items-center border-t border-line px-4 text-ui text-muted hover:bg-hover hover:text-ink'

/** A Today block's "All N" names its full list by these (FR-011 rule 3). */
export const TODAY_LISTS = {
  inProgress: 'today-in-progress',
  overdue: 'today-overdue',
  ready: 'today-ready',
} as const

type Listed = Pick<
  TodayTaskResponse | ReadyTaskResponse,
  'id' | 'title' | 'status' | 'dueAt' | 'projectId' | 'projectName' | 'path'
> & { children?: TodayTaskResponse['children'] }

/**
 * A BLOCK'S WHOLE LIST IN THE INSPECTOR (FR-011 rule 3, artboard 32): the block's own head (its
 * icon, name and count, its action, and close), then every row on two lines: status, name and
 * the block's marker; where it sits, and the block's action. A row opened takes the panel, with
 * "‹ Overdue 3 of 7" back and ↑ ↓ along the list. A row that leaves the list goes at once, and
 * the panel closes when none is left.
 */
function TaskList({
  title,
  badge,
  tasks,
  settled,
  headAction,
  marker,
  action,
  error,
}: {
  title: string
  badge: { icon: ComponentType<{ size?: number; className?: string }>; tint: string }
  tasks: readonly Listed[]
  settled: boolean
  headAction?: ReactNode
  marker: (t: Listed) => ReactNode
  action: (t: Listed) => ReactNode
  error: string | null
}) {
  const close = useCloseInspector()
  const go = useInspectorGo()
  const projects = useEveryProject()
  const empty = settled && tasks.length === 0
  useEffect(() => {
    if (empty) close()
  }, [empty, close])
  const among = tasks.map((t) => ({ type: 'task' as const, id: t.id }))
  return (
    <>
      <ListHead badge={badge} title={title} count={tasks.length} action={headAction} />
      {error && (
        <p role="alert" className="px-4 pt-2 text-ui text-stop-t">
          {error}
        </p>
      )}
      <ul className="flex flex-col p-1.5">
        {tasks.map((t) => {
          const project = projects.data?.find((p) => p.id === t.projectId)
          return (
            <li
              key={t.id}
              data-list-row={t.id}
              className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-control px-2.5 py-2 hover:bg-hover"
            >
              <span className="flex">
                {t.children ? (
                  <ProgressSquare status={t.status} children={t.children} />
                ) : (
                  <StatusMark status={t.status} size={16} />
                )}
              </span>
              <button
                type="button"
                onClick={() => go?.({ type: 'task', id: t.id }, among)}
                className="min-w-0 truncate text-left text-ui text-ink hover:underline"
              >
                {t.title}
              </button>
              {marker(t)}
              <span />
              <span className="inline-flex min-w-0 items-center gap-1.5 text-ui text-muted">
                {project && <ProjectSquare project={project} />}
                <span className="truncate">{t.path.at(-1)?.title ?? t.projectName}</span>
              </span>
              {action(t)}
            </li>
          )
        })}
      </ul>
    </>
  )
}

function InProgressList() {
  const day = useAccountToday()
  const timeZone = useTimeZone()
  const today = useQuery(todayQuery(day))
  const [error, setError] = useState<string | null>(null)
  const actions = useTaskActions(setError)
  return (
    <TaskList
      title="In progress"
      badge={{ icon: InProgressIcon, tint: 'bg-go-bg text-go' }}
      tasks={todaySegments(today.data ?? []).inProgress}
      settled={today.isSuccess}
      marker={(t) => <DueChip dueAt={t.dueAt} today={day} timeZone={timeZone} />}
      action={(t) =>
        t.children ? (
          <span />
        ) : (
          <DoneButton id={t.id} title={t.title} onDone={() => actions.setStatus(t.id, 'done')} />
        )
      }
      error={error}
    />
  )
}

function OverdueList() {
  const day = useAccountToday()
  const timeZone = useTimeZone()
  const today = useQuery(todayQuery(day))
  const [error, setError] = useState<string | null>(null)
  const actions = useTaskActions(setError)
  const overdue = todaySegments(today.data ?? []).overdue
  const onMove = (id: TaskId, to: string) => actions.patch(id, { scheduledOn: to })
  return (
    <TaskList
      title="Overdue"
      badge={{ icon: FlagIcon, tint: 'bg-stop-bg text-stop' }}
      tasks={overdue}
      settled={today.isSuccess}
      headAction={<MoveAllMenu overdue={overdue} day={day} onMove={onMove} />}
      marker={(t) => <DueChip dueAt={t.dueAt} today={day} timeZone={timeZone} />}
      action={(t) => (t.children ? <span /> : <PlanButtons task={t} day={day} onMove={onMove} />)}
      error={error}
    />
  )
}

function ReadyList() {
  const day = useAccountToday()
  const ready = useQuery(readyQuery(day))
  // As the block offers them: not what Today's left column already lists.
  const listed = new Set((useQuery(todayQuery(day)).data ?? []).map((t) => t.id))
  const [error, setError] = useState<string | null>(null)
  const actions = useTaskActions(setError)
  return (
    <TaskList
      title="Ready to start"
      badge={{ icon: ToDoIcon, tint: 'bg-task-bg text-task' }}
      tasks={(ready.data ?? []).filter((t) => !listed.has(t.id))}
      settled={ready.isSuccess}
      marker={() => <span />}
      action={(t) => (
        <button
          type="button"
          onClick={() => actions.setStatus(t.id, 'in_progress')}
          aria-label={`Start “${t.title}”`}
          className={`${BUTTON.secondary} h-6.5 px-2.5 text-meta`}
        >
          Start
        </button>
      )}
      error={error}
    />
  )
}

/** Today's full lists, for the inspector. */
export const todayLists: InspectorList[] = [
  { name: TODAY_LISTS.inProgress, label: 'Today', icon: PLACE_ICON.today, Body: InProgressList },
  { name: TODAY_LISTS.overdue, label: 'Today', icon: PLACE_ICON.today, Body: OverdueList },
  { name: TODAY_LISTS.ready, label: 'Today', icon: PLACE_ICON.today, Body: ReadyList },
]
