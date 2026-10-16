import type {
  CalendarEntry,
  CompletedTaskResponse,
  DependencyRef,
  SearchTaskResponse,
  TaskId,
  TaskResponse,
  TodayTaskResponse,
} from '@ctws/contracts'
import { isoOrNull } from '../../platform/values'
import { dayEntry } from '../../shell/calendar'
import type { CalendarRow } from './queries/calendar'
import type { CompletedTask } from './queries/completed'
import type { SearchTask } from './queries/search'
import type { TodayTask } from './queries/today'
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
    segment: t.segment,
    blockedBy: blockers.get(t.id) ?? [],
  }
}

export function toCompletedResponse(t: CompletedTask): CompletedTaskResponse {
  return {
    ...toTaskResponse(t),
    completedAt: t.completedAt.toISOString(),
    projectName: t.projectName,
    parentTitle: t.parentTitle,
    completedOn: t.completedOn,
  }
}

export function toSearchResponse(t: SearchTask): SearchTaskResponse {
  return {
    ...toTaskResponse(t),
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
  })
}
