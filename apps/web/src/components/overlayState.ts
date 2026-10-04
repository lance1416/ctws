/**
 * How many overlays are open. The document-level single-key handlers (`/`, `f`, `?`, the jump
 * chords) live outside the overlays and would otherwise keep firing underneath them -- pressing
 * `f` while the shortcut list is up would stack a search dialog on top of it.
 *
 * A counter rather than a boolean so a future second layer cannot clear the flag of the first.
 */
let open = 0

export function enterOverlay(): void {
  open += 1
}

export function exitOverlay(): void {
  open = Math.max(0, open - 1)
}

export function isOverlayOpen(): boolean {
  return open > 0
}
