/**
 * THE SERVER'S PRESENT (BUG-020): the server says what time it is with the account (`me.now`), and
 * may be pinned to a moment for acceptance and UAT. The page keeps the browser's clock running
 * from there: the offset between the two, applied to every reading of the time.
 */
let offset = 0
const listeners = new Set<() => void>()

/** Takes the server's `now`, read just as the answer arrived. */
export function setServerNow(iso: string, readAt = Date.now()): void {
  const next = Date.parse(iso) - readAt
  // A second either way is the network, not a pinned clock.
  if (Math.abs(next - offset) < 1000) return
  offset = next
  for (const listener of listeners) listener()
}

/** The present on the server's clock. */
export const serverNow = (): Date => new Date(Date.now() + offset)

/** Called when the offset changes, so a page showing the time redraws. */
export function onServerClock(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
