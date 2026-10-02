const keyFor = (projectId: string) => `ctws.collapsed.${projectId}`

/**
 * Which rows are folded, per project. A per-viewer convenience, so it lives in localStorage
 * rather than on the server -- but every accessor is wrapped, because in a private window, with
 * site data cleared, or with storage disabled, `localStorage` THROWS on access. An uncaught throw
 * here blanks the whole page, which is an absurd price for remembering folded rows.
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
