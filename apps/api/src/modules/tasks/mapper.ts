import type {
  CalendarEntry,
  CompletedTaskResponse,
  DependencyRef,
  SearchTaskResponse,
  TaskResponse,
  TodayTaskResponse,
} from '@ctws/contracts'
import { dayEntry } from '../../shell/calendar/entry'
import type { CalendarRow } from './queries/calendar'
import type { CompletedTask } from './queries/completed'
import type { SearchTask } from './queries/search'
import type { TodayTask } from './queries/today'
import type { Task } from './tables'

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null)

export function toTaskResponse(t: Task): TaskResponse {
  return {
    id: t.id,
    projectId: t.projectId,
    parentId: t.parentId,
    title: t.title,
    notes: t.notes,
    status: t.status,
    scheduledOn: t.scheduledOn,
    dueAt: iso(t.dueAt),
    rank: t.rank,
    manualProgress: t.manualProgress === null ? null : Number(t.manualProgress),
    completedAt: iso(t.completedAt),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }
}

export function toTodayResponse(
  t: TodayTask,
  blockers: Map<string, DependencyRef[]>,
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
    // A task can be both planned and due, so the id says which.
    id: `${r.id}:${r.kind}`,
    day: r.day,
    title: r.title,
    to: '/tasks/today',
    kind: r.kind,
    projectId: r.projectId,
    projectName: r.projectName,
  })
}
