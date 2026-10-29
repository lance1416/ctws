/**
 * WHAT A CLOSED FORM HAD IN IT (FR-029): Esc closes a form without asking and keeps what was
 * typed, so opening the same form again brings it back. Only Cancel lets it go, asking first.
 * Kept for the tab, by the form's key, until saved, discarded or signed out; a reload keeps it.
 */
const PREFIX = 'ctws.draft.'

/** Storage the browser may refuse (a private window): then there is nothing kept. */
function store(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function keptDraft<T>(key: string): T | undefined {
  try {
    const raw = store()?.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch {
    return undefined
  }
}

/** Keeps a form's values, or lets them go when nothing was typed (`null`). */
export function keepDraft(key: string, values: unknown) {
  try {
    if (values === null) store()?.removeItem(PREFIX + key)
    else store()?.setItem(PREFIX + key, JSON.stringify(values))
  } catch {
    // Full or refused: the form still works, it just keeps nothing.
  }
}

export const forgetDraft = (key: string) => keepDraft(key, null)

/** Signing out: the next to sign in may be someone else. */
export function forgetDrafts() {
  const s = store()
  if (!s) return
  for (const key of Object.keys(s)) if (key.startsWith(PREFIX)) s.removeItem(key)
}
