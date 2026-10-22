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

const doneKeyFor = (projectId: ProjectId) => `ctws.shownDone.${projectId}`

/**
 * Which groups of finished rows this project's tree has opened: a parent's id, or `top` for the
 * project's own. All folded by default. Wrapped as above.
 */
export function loadShownDone(projectId: ProjectId): Set<TaskId | 'top'> {
  try {
    const raw = localStorage.getItem(doneKeyFor(projectId))
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(
      parsed
        .filter((v): v is string => typeof v === 'string')
        .map((v) => (v === 'top' ? 'top' : idFrom(taskId, v))),
    )
  } catch {
    return new Set()
  }
}

export function saveShownDone(projectId: ProjectId, groups: ReadonlySet<TaskId | 'top'>): void {
  try {
    if (groups.size === 0) localStorage.removeItem(doneKeyFor(projectId))
    else localStorage.setItem(doneKeyFor(projectId), JSON.stringify([...groups]))
  } catch {
    // The choice simply stops being remembered.
  }
}
