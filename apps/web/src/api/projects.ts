import type { ProjectColor, ProjectListItem, ProjectResponse } from '@ctws/contracts'
import { apiFetch } from '../api'

/**
 * Every reader of the ['projects'] cache entry goes through this one function, so they all see
 * the same shape -- including `openTasks`, which the server counts in the same query that lists
 * the projects. Nothing here recounts anything client-side.
 */
export async function listProjects(): Promise<ProjectListItem[]> {
  return (await apiFetch<{ projects: ProjectListItem[] }>('/projects')).projects
}

/**
 * The projects that have been put away. The server lists ONLY the live ones unless asked, so an
 * archived project is in no list above -- this is the one way to see one. Under ['projects'], so a
 * refresh of the projects reaches it too.
 */
export const archivedProjectsKey = ['projects', 'archived'] as const
export async function listArchivedProjects(): Promise<ProjectListItem[]> {
  return (await apiFetch<{ projects: ProjectListItem[] }>('/projects?archived=true')).projects
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
export function inboxOf<T extends ProjectResponse>(projects: T[]): T | undefined {
  return projects.find((p) => p.isInbox)
}

/** Renames a project, or repaints it. Both are ordinary scalar fields on the project row. */
export function updateProject(
  id: string,
  body: { name?: string; color?: ProjectColor },
): Promise<ProjectResponse> {
  return apiFetch<ProjectResponse>(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}
