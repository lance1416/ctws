import type { ProjectMovementResponse } from '@ctws/contracts'
import { apiFetch } from '../../../platform/http/api'

/** Every number is the server's, computed in the user's timezone; nothing is re-derived here. */
export async function listMovement(): Promise<ProjectMovementResponse[]> {
  return (await apiFetch<{ projects: ProjectMovementResponse[] }>('/tasks/movement')).projects
}
