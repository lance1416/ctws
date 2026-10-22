import type { ProjectId } from '@ctws/contracts'

const keyFor = (projectId: ProjectId) => `ctws.boardFolds.${projectId}`

/**
 * The board's groups someone folded or opened by hand, per project (DES-001 section 4): a
 * status and a group's head, `todo:<id>`, to whether it is open. Every access is wrapped:
 * `localStorage` throws in a private window or with storage disabled.
 */
export function loadBoardFolds(projectId: ProjectId): Map<string, boolean> {
  try {
    const raw = localStorage.getItem(keyFor(projectId))
    if (!raw) return new Map()
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return new Map()
    return new Map(
      Object.entries(parsed).filter((e): e is [string, boolean] => typeof e[1] === 'boolean'),
    )
  } catch {
    return new Map()
  }
}

export function saveBoardFolds(projectId: ProjectId, folds: ReadonlyMap<string, boolean>): void {
  try {
    if (folds.size === 0) localStorage.removeItem(keyFor(projectId))
    else localStorage.setItem(keyFor(projectId), JSON.stringify(Object.fromEntries(folds)))
  } catch {
    // The choice simply stops being remembered.
  }
}
