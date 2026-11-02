/** How deep folders of notes go (REQ-002 FR-117): a folder, one in it, and one in that. */
export const FOLDER_DEPTH = 3

/** A folder as the tree needs it: itself and where it sits. */
type Placed = { id: string; parentId: string | null }

/** How deep `id` sits: 1 at the top. */
export function depthOf(folders: readonly Placed[], id: string): number {
  const byId = new Map(folders.map((f) => [f.id, f]))
  let depth = 0
  for (let at = byId.get(id); at; at = at.parentId ? byId.get(at.parentId) : undefined) depth++
  return depth
}

/** `id` and every folder under it, at any depth. */
export function subtreeOf(folders: readonly Placed[], id: string): Set<string> {
  const inside = new Set([id])
  for (let grew = true; grew;) {
    grew = false
    for (const f of folders)
      if (f.parentId && inside.has(f.parentId) && !inside.has(f.id)) {
        inside.add(f.id)
        grew = true
      }
  }
  return inside
}

/** How many levels `id` takes, itself counted: 1 for a folder with none in it. */
export function heightOf(folders: readonly Placed[], id: string): number {
  const under = folders.filter((f) => f.parentId === id)
  return 1 + Math.max(0, ...under.map((f) => heightOf(folders, f.id)))
}

/**
 * Whether `id` may go into `parent` (null: the top): not into itself or under itself, and no
 * deeper than three with all it holds.
 */
export function mayGoInto(folders: readonly Placed[], id: string, parent: string | null): boolean {
  if (parent === null) return true
  if (subtreeOf(folders, id).has(parent)) return false
  return depthOf(folders, parent) + heightOf(folders, id) <= FOLDER_DEPTH
}

/**
 * The name a folder keeps moving among `taken` (FR-117): its own, else the first of "Talks 2",
 * "Talks 3"… not taken. Never merged, never refused.
 */
export function freeName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name
  for (let n = 2; ; n++) if (!taken.has(`${name} ${n}`)) return `${name} ${n}`
}
