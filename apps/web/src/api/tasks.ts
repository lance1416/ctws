import type { CreateTaskBody, MoveTaskBody, TaskResponse, UpdateTaskBody } from '@ctws/contracts'
import { apiFetch } from '../api'

export async function listProjectTasks(projectId: string): Promise<TaskResponse[]> {
  return (await apiFetch<{ tasks: TaskResponse[] }>(`/tasks?projectId=${projectId}`)).tasks
}

/**
 * `status` is omitted rather than defaulted here: the contract defaults it to `backlog`, which is
 * what capturing a line costs nothing means (spec §6.3), and the 新建 dialog is the one caller
 * that has an opinion about it. The input type is the contract's own, so every field the server
 * accepts at creation -- status, the two dates, the notes -- can be written in ONE request instead
 * of a POST followed by a PATCH.
 */
export type NewTask = Omit<CreateTaskBody, 'status'> & { status?: CreateTaskBody['status'] }

export function createTask(body: NewTask): Promise<TaskResponse> {
  return apiFetch<TaskResponse>('/tasks', { method: 'POST', body: JSON.stringify(body) })
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
