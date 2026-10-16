import {
  api,
  type ResponseOf,
  type TaskPosition,
  type TaskResponse,
  type UpdateTaskBody,
  type ProjectId,
  type TaskId,
} from '@ctws/contracts'
import { call } from '../../../platform/http/api'
import type { CreateTaskForm } from '../taskForm'

/** The list and its rollups share one cache entry, so the numbers always match the rows. */
export type ProjectTasks = ResponseOf<typeof api.tasks.board>

export function listProjectTasks(projectId: ProjectId): Promise<ProjectTasks> {
  return call(api.tasks.board, { query: { projectId } })
}

/** Both directions for one task, finished blockers included -- what the detail pane shows. */
export function taskDependencies(id: TaskId) {
  return call(api.tasks.dependencies, { params: { id } })
}

/** `id` is the task that waits; `blockerId` is what it waits for. */
export function addDependency(id: TaskId, blockerId: TaskId): Promise<void> {
  return call(api.tasks.addDependency, { params: { id, blockerId } })
}

export function removeDependency(id: TaskId, blockerId: TaskId): Promise<void> {
  return call(api.tasks.removeDependency, { params: { id, blockerId } })
}

/** Without a `status` the server files the task under `todo`. */
export function createTask(body: CreateTaskForm): Promise<TaskResponse> {
  return call(api.tasks.create, { body })
}

/** One task by its id: what a link to a task asks to find the project it lives in. */
export function getTask(id: TaskId): Promise<TaskResponse> {
  return call(api.tasks.get, { params: { id } })
}

export function patchTask(id: TaskId, body: UpdateTaskBody): Promise<TaskResponse> {
  return call(api.tasks.update, { params: { id }, body })
}

/** A move is a PATCH that names where the task lands; the server keeps the tree whole. */
export function moveTask(id: TaskId, position: TaskPosition): Promise<TaskResponse> {
  return call(api.tasks.update, { params: { id }, body: position })
}

export function deleteTask(id: TaskId): Promise<void> {
  return call(api.tasks.remove, { params: { id } })
}
