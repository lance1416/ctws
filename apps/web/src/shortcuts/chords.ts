/**
 * The `g`-prefixed jump chords, borrowed from OpenProject (D46/B6). A chord rather than a bare
 * key because the four destinations would otherwise eat four more single letters, and `g` reads
 * as "go".
 *
 * `inbox` is resolved to a project id by the caller: the destination is a row in the database,
 * not a route literal, so it cannot live in this table.
 */
export type JumpTarget = 'today' | 'projects' | 'completed' | 'inbox'

export const JUMPS: { key: string; target: JumpTarget; label: string }[] = [
  { key: 't', target: 'today', label: '今天' },
  { key: 'p', target: 'projects', label: '项目' },
  { key: 'd', target: 'completed', label: '已完成' },
  { key: 'i', target: 'inbox', label: '收件箱' },
]

/** The chord prefix. */
export const JUMP_PREFIX = 'g'

/** How long a pending `g` waits for its second key before it is forgotten. */
export const CHORD_TIMEOUT_MS = 1500

/** The second half of a chord, or null if that key starts no jump. */
export function resolveJump(key: string): JumpTarget | null {
  return JUMPS.find((j) => j.key === key)?.target ?? null
}
