import type { ProjectResponse } from '@ctws/contracts'
import { apiFetch } from '../api'

export async function listProjects(): Promise<ProjectResponse[]> {
  return (await apiFetch<{ projects: ProjectResponse[] }>('/projects')).projects
}

export function createProject(body: { name: string }): Promise<ProjectResponse> {
  return apiFetch<ProjectResponse>('/projects', { method: 'POST', body: JSON.stringify(body) })
}

export function deleteProject(id: string): Promise<void> {
  return apiFetch<void>(`/projects/${id}`, { method: 'DELETE' })
}

/**
 * The quick-capture destination. Found by the `isInbox` flag, never by name: the name is just a
 * label the user may change, and a name match would also break under any other language.
 */
export function inboxOf(projects: ProjectResponse[]): ProjectResponse | undefined {
  return projects.find((p) => p.isInbox)
}
