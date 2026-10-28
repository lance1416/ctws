import type { ReadyTaskResponse, TodayTaskResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { InspectorList } from '../../../shell/contract'
import { FlagIcon, InProgressIcon, PLACE_ICON, ToDoIcon } from '../../../platform/ui/icons'
import { StatusMark } from '../../../platform/ui/StatusMark'
import { useAccountToday } from '../../../shell/auth'
import { NarrowHead, NarrowRow } from '../../../shell/inspector'
import { ProjectSquare, useEveryProject } from '../../../shell/projects'
import { readyQuery, todayQuery } from '../api'
import { revealHref } from '../logic/crumb'
import { todaySegments } from '../logic/today'

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
  'id' | 'title' | 'status' | 'projectId' | 'projectName' | 'path'
>

/** One list: its head, then each task by its status, its name and where it sits. */
function TaskList({
  title,
  mark,
  tasks,
  isPending,
}: {
  title: string
  mark: ReactNode
  tasks: readonly Listed[]
  isPending: boolean
}) {
  const projects = useEveryProject()
  return (
    <>
      <NarrowHead
        mark={mark}
        title={title}
        tags={<span className="text-muted tabular-nums">{tasks.length}</span>}
      />
      <div className="border-t border-line px-4 py-3">
        {tasks.length === 0 && !isPending ? (
          <p className="text-meta text-subtle">Nothing here now</p>
        ) : (
          <ul className="flex flex-col">
            {tasks.map((t) => {
              const project = projects.data?.find((p) => p.id === t.projectId)
              return (
                <NarrowRow
                  key={t.id}
                  mark={<StatusMark status={t.status} size={14} />}
                  thing={{ type: 'task', id: t.id }}
                  to={revealHref(t.projectId, t.id)}
                  title={t.title}
                  fact={
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      {project && <ProjectSquare project={project} />}
                      <span className="truncate">{t.path.at(-1)?.title ?? t.projectName}</span>
                    </span>
                  }
                />
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}

function InProgressList() {
  const today = useQuery(todayQuery(useAccountToday()))
  return (
    <TaskList
      title="In progress"
      mark={<InProgressIcon size={20} aria-hidden="true" className="text-go" />}
      tasks={todaySegments(today.data ?? []).inProgress}
      isPending={today.isPending}
    />
  )
}

function OverdueList() {
  const today = useQuery(todayQuery(useAccountToday()))
  return (
    <TaskList
      title="Overdue"
      mark={<FlagIcon size={20} aria-hidden="true" className="text-stop" />}
      tasks={todaySegments(today.data ?? []).overdue}
      isPending={today.isPending}
    />
  )
}

function ReadyList() {
  const day = useAccountToday()
  const ready = useQuery(readyQuery(day))
  // As the block offers them: not what Today's left column already lists.
  const listed = new Set((useQuery(todayQuery(day)).data ?? []).map((t) => t.id))
  return (
    <TaskList
      title="Ready to start"
      mark={<ToDoIcon size={20} aria-hidden="true" className="text-task" />}
      tasks={(ready.data ?? []).filter((t) => !listed.has(t.id))}
      isPending={ready.isPending}
    />
  )
}

/** Today's full lists, for the inspector. */
export const todayLists: InspectorList[] = [
  { name: TODAY_LISTS.inProgress, label: 'Today', icon: PLACE_ICON.today, Body: InProgressList },
  { name: TODAY_LISTS.overdue, label: 'Today', icon: PLACE_ICON.today, Body: OverdueList },
  { name: TODAY_LISTS.ready, label: 'Today', icon: PLACE_ICON.today, Body: ReadyList },
]
