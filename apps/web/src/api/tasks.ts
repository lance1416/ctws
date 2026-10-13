import type {
  CreateTaskBody,
  DependencyRef,
  MoveTaskBody,
  RollupResponse,
  TaskResponse,
  UpdateTaskBody,
} from '@ctws/contracts'
import { apiFetch } from '../api'

/**
 * A project's flat task list AND its rollups, which the endpoint returns side by side. They are
 * kept together in one cache entry because they are one answer about one moment: a list whose
 * numbers came from a different fetch could disagree with itself.
 */
export type ProjectTasks = {
  tasks: TaskResponse[]
  rollups: Record<string, RollupResponse>
  /** Keyed by the WAITING task's id; only what is still in the way. */
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

/** `id` is the task that WAITS; `blockerId` is what it waits for. */
export function addDependency(id: string, blockerId: string): Promise<void> {
  return apiFetch(`/tasks/${id}/dependencies`, {
    method: 'POST',
    body: JSON.stringify({ blockerId }),
  })
}

export function removeDependency(id: string, blockerId: string): Promise<void> {
  return apiFetch(`/tasks/${id}/dependencies/${blockerId}`, { method: 'DELETE' })
}

/**
 * `status` is omitted rather than defaulted here: the contract defaults it to `backlog`, which is
 * what capturing a line costs nothing means, and the New task dialog is the one caller that has an
 * opinion about it. The input type is the contract's own, so every field the server accepts at
 * creation -- status, the two dates, the notes -- can be written in ONE request instead of a POST
 * followed by a PATCH.
 */
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
