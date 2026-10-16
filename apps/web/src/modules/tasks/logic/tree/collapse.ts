import { idFrom, type ProjectId, taskId, type TaskId } from '@ctws/contracts'

const keyFor = (projectId: ProjectId) => `ctws.collapsed.${projectId}`

/**
 * Which rows are folded, per project. Every access is wrapped: `localStorage` throws in a private
 * window or with storage disabled, and an uncaught throw here would blank the page.
 */
export function loadCollapsed(projectId: ProjectId): Set<TaskId> {
  try {
    const raw = localStorage.getItem(keyFor(projectId))
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(
      parsed.filter((v): v is string => typeof v === 'string').map((v) => idFrom(taskId, v)),
    )
  } catch {
    return new Set()
  }
}

export function saveCollapsed(projectId: ProjectId, ids: ReadonlySet<TaskId>): void {
  try {
    localStorage.setItem(keyFor(projectId), JSON.stringify([...ids]))
  } catch {
    // Folding simply stops being remembered. Nothing else on the page depends on it.
  }
}

const doneKeyFor = (projectId: ProjectId) => `ctws.showDone.${projectId}`

/** Whether this project's tree shows its finished rows; hidden by default. Wrapped as above. */
export function loadShowDone(projectId: ProjectId): boolean {
  try {
    return localStorage.getItem(doneKeyFor(projectId)) === '1'
  } catch {
    return false
  }
}

export function saveShowDone(projectId: ProjectId, show: boolean): void {
  try {
    if (show) localStorage.setItem(doneKeyFor(projectId), '1')
    else localStorage.removeItem(doneKeyFor(projectId))
  } catch {
    // The choice simply stops being remembered.
  }
}
