/**
 * WHAT ESC DOES IN THE EDITOR WITH THE FOCUS (FR-029, REQ-002 FR-112): closes its `@` list, or
 * takes vim back to NORMAL. A layer that hears Esc before the editor does (a dialog listens on the
 * whole document first) asks it here, rather than swallowing the key: a key a layer has marked
 * done, the editor no longer acts on (BUG-098). No CodeMirror here: layers import this, and the
 * editor's code is fetched only where writing starts.
 */
let taker: (() => boolean) | null = null

/** Said by an editor as it takes the focus, and, with the same function, as it lets it go. */
export function holdEscape(take: () => boolean): void {
  taker = take
}

export function releaseEscape(take: () => boolean): void {
  if (taker === take) taker = null
}

/** The focused editor's Esc, done: true when it was the editor's, and the layer stays. */
export function escapeInEditor(): boolean {
  return taker?.() ?? false
}

/**
 * Keys the editor kept from vim and passed on to the page (Esc in NORMAL, Ctrl K): CodeMirror marks
 * any key it was handed as done, so the pane, the inspector and the page's keys read these as not.
 */
const passed = new WeakSet<Event>()

export const passOn = (e: Event): void => void passed.add(e)

/** Whether a key is done: marked so, and not merely passed on by the editor. */
export const keyDone = (e: Event): boolean => e.defaultPrevented && !passed.has(e)
