import type {
  CalendarEntry,
  DependencyRef,
  ReadyTaskResponse,
  SearchTaskResponse,
  TaskId,
  TaskResponse,
  TodayTaskResponse,
} from '@ctws/contracts'
import { isoOrNull } from '../../platform/values'
import { dayEntry } from '../../shell/calendar'
import type { CalendarRow, ReadyTask, SearchTask, TodayTask } from './queries'
import type { Task } from './tables'

export function toTaskResponse(t: Task): TaskResponse {
  return {
    id: t.id,
    projectId: t.projectId,
    parentId: t.parentId,
    title: t.title,
    notes: t.notes,
    status: t.status,
    scheduledOn: t.scheduledOn,
    dueAt: isoOrNull(t.dueAt),
    rank: t.rank,
    stageId: t.stageId,
    stageSince: isoOrNull(t.stageSince),
    completedAt: isoOrNull(t.completedAt),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }
}

export function toTodayResponse(
  t: TodayTask,
  blockers: Map<TaskId, DependencyRef[]>,
): TodayTaskResponse {
  return {
    ...toTaskResponse(t),
    projectName: t.projectName,
    parentTitle: t.parentTitle,
    path: t.path,
    segment: t.segment,
    blockedBy: blockers.get(t.id) ?? [],
    children: t.children,
  }
}

export function toReadyResponse(t: ReadyTask): ReadyTaskResponse {
  return { ...toTaskResponse(t), projectName: t.projectName, path: t.path }
}

export function toSearchResponse(t: SearchTask): SearchTaskResponse {
  const { notes: _, ...summary } = toTaskResponse(t)
  return {
    ...summary,
    projectName: t.projectName,
    parentTitle: t.parentTitle,
    projectArchived: t.projectArchived,
  }
}

export function toCalendarEntry(r: CalendarRow): CalendarEntry {
  return dayEntry({
    // A task can be both planned and due: two entries, told apart by `kind`.
    type: 'task',
    id: r.id,
    kind: r.kind,
    day: r.day,
    title: r.title,
    projectId: r.projectId,
    projectName: r.projectName,
    done: r.done,
  })
}
