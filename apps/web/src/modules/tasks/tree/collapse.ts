const keyFor = (projectId: string) => `ctws.collapsed.${projectId}`

/**
 * Which rows are folded, per project. Every access is wrapped: `localStorage` throws in a private
 * window or with storage disabled, and an uncaught throw here would blank the page.
 */
export function loadCollapsed(projectId: string): Set<string> {
  try {
    const raw = localStorage.getItem(keyFor(projectId))
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((v): v is string => typeof v === 'string'))
  } catch {
    return new Set()
  }
}

export function saveCollapsed(projectId: string, ids: ReadonlySet<string>): void {
  try {
    localStorage.setItem(keyFor(projectId), JSON.stringify([...ids]))
  } catch {
    // Folding simply stops being remembered. Nothing else on the page depends on it.
  }
}

const doneKeyFor = (projectId: string) => `ctws.showDone.${projectId}`

/** Whether this project's tree shows its finished rows; hidden by default. Wrapped as above. */
export function loadShowDone(projectId: string): boolean {
  try {
    return localStorage.getItem(doneKeyFor(projectId)) === '1'
  } catch {
    return false
  }
}

export function saveShowDone(projectId: string, show: boolean): void {
  try {
    if (show) localStorage.setItem(doneKeyFor(projectId), '1')
    else localStorage.removeItem(doneKeyFor(projectId))
  } catch {
    // The choice simply stops being remembered.
  }
}
