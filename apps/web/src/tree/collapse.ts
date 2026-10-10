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

const doneKeyFor = (projectId: string) => `ctws.showDone.${projectId}`

/**
 * Whether this project's tree shows its finished rows. Hidden is the default: a tree is
 * what is left to do, and after a few weeks the done rows outnumber the live ones.
 *
 * Same storage and the same reasoning as the folds above -- a per-viewer convenience, every
 * accessor wrapped. It is a separate key rather than a field beside them so that reading one
 * cannot be broken by the other's shape changing.
 */
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
