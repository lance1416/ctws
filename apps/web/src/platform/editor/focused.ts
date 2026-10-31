import { useSyncExternalStore } from 'react'

/** What the phone's row over the keyboard does: four marks, `@`, and undo (FR-113). */
export type EditorAction = 'heading' | 'list' | 'task' | 'mention' | 'link' | 'undo'

/** The editor with the focus, as the page around it reaches it. */
export type FocusedEditor = {
  /** Its Esc, done: true when it was the editor's (its `@` list, vim back to NORMAL). */
  escape: () => boolean
  /** The phone's buttons, on the text where its cursor is (FR-113). */
  act: (action: EditorAction) => void
}

/**
 * THE EDITOR WITH THE FOCUS (FR-029, REQ-002 FR-112, FR-113). A layer that hears Esc before the
 * editor does (a dialog listens on the whole document first) asks it here, rather than swallowing
 * the key: a key a layer has marked done, the editor no longer acts on (BUG-098). The phone's row
 * over the keyboard is drawn while there is one. No CodeMirror here: layers import this, and the
 * editor's code is fetched only where writing starts.
 */
let focused: FocusedEditor | null = null
const heard = new Set<() => void>()

/** Said by an editor as it takes the focus, and, with the same object, as it lets it go. */
export function holdFocus(editor: FocusedEditor): void {
  focused = editor
  heard.forEach((h) => h())
}

export function releaseFocus(editor: FocusedEditor): void {
  if (focused !== editor) return
  focused = null
  heard.forEach((h) => h())
}

export function useFocusedEditor(): FocusedEditor | null {
  return useSyncExternalStore(
    (h) => {
      heard.add(h)
      return () => heard.delete(h)
    },
    () => focused,
  )
}

/** The focused editor's Esc, done: true when it was the editor's, and the layer stays. */
export function escapeInEditor(): boolean {
  return focused?.escape() ?? false
}

/**
 * Keys the editor kept from vim and passed on to the page (Esc in NORMAL, Ctrl K): CodeMirror marks
 * any key it was handed as done, so the pane, the inspector and the page's keys read these as not.
 */
const passed = new WeakSet<Event>()

export const passOn = (e: Event): void => void passed.add(e)

/** Whether a key is done: marked so, and not merely passed on by the editor. */
export const keyDone = (e: Event): boolean => e.defaultPrevented && !passed.has(e)
