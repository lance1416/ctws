/**
 * The project identity rail: which of the six categorical hues a project wears.
 *
 * It is derived from the project id, not stored and not taken from the list position, for two
 * reasons: a position-derived colour would re-paint every rail the moment a project is created,
 * archived or reordered -- the rail is supposed to be the one thing about a project that never
 * moves -- and a stored colour would need a UI, a migration and a default. The id is a uuidv7
 * and never changes, so the hue is stable for the life of the project.
 *
 * Six is the count the design plan fixes, and it is deliberately not "one per project": two of
 * twelve projects sharing a hue is fine, because the chip NEVER carries meaning on its own. It
 * always sits beside the project's name (WCAG 1.4.1), so it is a pre-attentive hint for scanning
 * a cross-project list, not an identifier.
 */
export const PROJECT_HUES = 6

/** 1..6, the suffix of the `project-N` colour token. Stable for a given id. */
export function projectHue(id: string): number {
  // FNV-1a over the whole id. A cheap sum of char codes would collide on anagrams and, worse,
  // spread badly across six buckets for ids that share a prefix -- which uuidv7s all do, since
  // the leading bits are a timestamp.
  let hash = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return (hash % PROJECT_HUES) + 1
}

/**
 * The Tailwind background class for a project's rail or chip. A lookup table, not a template
 * string: Tailwind only emits classes it can see in the source, so `bg-project-${n}` would
 * compile to nothing.
 */
const RAIL: Record<number, string> = {
  1: 'bg-project-1',
  2: 'bg-project-2',
  3: 'bg-project-3',
  4: 'bg-project-4',
  5: 'bg-project-5',
  6: 'bg-project-6',
}

export function projectRailClass(id: string): string {
  return RAIL[projectHue(id)]!
}
