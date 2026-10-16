import type {
  CreateTaskBody,
  DependencyRef,
  MoveTaskBody,
  RollupResponse,
  TaskResponse,
  UpdateTaskBody,
} from '@ctws/contracts'
import { apiFetch } from '../../../platform/http/api'

/** The list and its rollups share one cache entry, so the numbers always match the rows. */
export type ProjectTasks = {
  tasks: TaskResponse[]
  rollups: Record<string, RollupResponse>
  /** Keyed by the waiting task's id; only what is still in the way. */
  blockers: Record<string, DependencyRef[]>
}

export async function listProjectTasks(projectId: string): Promise<ProjectTasks> {
  const body = await apiFetch<ProjectTasks>(`/tasks?projectId=${projectId}`)
  return { tasks: body.tasks, rollups: body.rollups ?? {}, blockers: body.blockers ?? {} }
}

/** Both directions for one task, finished blockers included -- what the detail pane shows. */
export function taskDependencies(
  id: string,
): Promise<{ blockedBy: DependencyRef[]; blocks: DependencyRef[] }> {
  return apiFetch(`/tasks/${id}/dependencies`)
}

/** `id` is the task that waits; `blockerId` is what it waits for. */
export function addDependency(id: string, blockerId: string): Promise<void> {
  return apiFetch(`/tasks/${id}/dependencies`, {
    method: 'POST',
    body: JSON.stringify({ blockerId }),
  })
}

export function removeDependency(id: string, blockerId: string): Promise<void> {
  return apiFetch(`/tasks/${id}/dependencies/${blockerId}`, { method: 'DELETE' })
}

/** Without a `status` the server files the task under `todo`. */
export type NewTask = Omit<CreateTaskBody, 'status'> & { status?: CreateTaskBody['status'] }

export function createTask(body: NewTask): Promise<TaskResponse> {
  return apiFetch<TaskResponse>('/tasks', { method: 'POST', body: JSON.stringify(body) })
}

/** One task by its id: what a link to a task asks to find the project it lives in. */
export function getTask(id: string): Promise<TaskResponse> {
  return apiFetch<TaskResponse>(`/tasks/${id}`)
}

export function patchTask(id: string, body: UpdateTaskBody): Promise<TaskResponse> {
  return apiFetch<TaskResponse>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function moveTask(id: string, body: MoveTaskBody): Promise<TaskResponse> {
  return apiFetch<TaskResponse>(`/tasks/${id}/move`, { method: 'POST', body: JSON.stringify(body) })
}

export function deleteTask(id: string): Promise<void> {
  return apiFetch<void>(`/tasks/${id}`, { method: 'DELETE' })
}
