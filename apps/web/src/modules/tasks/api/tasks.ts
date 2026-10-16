import {
  type DependencyRef,
  type MoveTaskBody,
  type RollupResponse,
  type TaskResponse,
  type UpdateTaskBody,
  type ProjectId,
  type TaskId,
} from '@ctws/contracts'
import { apiFetch } from '../../../platform/http/api'
import type { CreateTaskForm } from '../taskForm'

/** The list and its rollups share one cache entry, so the numbers always match the rows. */
export type ProjectTasks = {
  tasks: TaskResponse[]
  rollups: Record<string, RollupResponse>
  /** Keyed by the waiting task's id; only what is still in the way. */
  blockers: Record<string, DependencyRef[]>
}

export function listProjectTasks(projectId: ProjectId): Promise<ProjectTasks> {
  return apiFetch<ProjectTasks>(`/tasks?projectId=${projectId}`)
}

/** Both directions for one task, finished blockers included -- what the detail pane shows. */
export function taskDependencies(
  id: TaskId,
): Promise<{ blockedBy: DependencyRef[]; blocks: DependencyRef[] }> {
  return apiFetch(`/tasks/${id}/dependencies`)
}

/** `id` is the task that waits; `blockerId` is what it waits for. */
export function addDependency(id: TaskId, blockerId: TaskId): Promise<void> {
  return apiFetch(`/tasks/${id}/dependencies`, {
    method: 'POST',
    body: JSON.stringify({ blockerId }),
  })
}

export function removeDependency(id: TaskId, blockerId: TaskId): Promise<void> {
  return apiFetch(`/tasks/${id}/dependencies/${blockerId}`, { method: 'DELETE' })
}

/** Without a `status` the server files the task under `todo`. */
export function createTask(body: CreateTaskForm): Promise<TaskResponse> {
  return apiFetch<TaskResponse>('/tasks', { method: 'POST', body: JSON.stringify(body) })
}

/** One task by its id: what a link to a task asks to find the project it lives in. */
export function getTask(id: TaskId): Promise<TaskResponse> {
  return apiFetch<TaskResponse>(`/tasks/${id}`)
}

export function patchTask(id: TaskId, body: UpdateTaskBody): Promise<TaskResponse> {
  return apiFetch<TaskResponse>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function moveTask(id: TaskId, body: MoveTaskBody): Promise<TaskResponse> {
  return apiFetch<TaskResponse>(`/tasks/${id}/move`, { method: 'POST', body: JSON.stringify(body) })
}

export function deleteTask(id: TaskId): Promise<void> {
  return apiFetch<void>(`/tasks/${id}`, { method: 'DELETE' })
}
