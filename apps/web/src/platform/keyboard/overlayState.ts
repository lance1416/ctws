/**
 * How many overlays are open; the document-level single-key handlers stand down while any is. A
 * counter, so one layer closing cannot clear another's.
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
