import type { MoveTaskBody, TaskResponse, UpdateTaskBody } from '@ctws/contracts'
import { apiFetch } from '../api'

export async function listProjectTasks(projectId: string): Promise<TaskResponse[]> {
  return (await apiFetch<{ tasks: TaskResponse[] }>(`/projects/${projectId}/tasks`)).tasks
}

export function createTask(body: {
  projectId: string
  title: string
  parentId?: string | null
}): Promise<TaskResponse> {
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
