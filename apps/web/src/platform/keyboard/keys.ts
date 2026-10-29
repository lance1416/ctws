/**
 * Whether the event comes from somewhere the user is typing, a contenteditable host included.
 * Every single-key shortcut asks, or `c` and `g` could not be typed into a field.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.isContentEditable === true || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
}

/** No Ctrl, Meta or Alt. Shift is allowed: `?` is Shift+/. */
export function isBareKey(e: { ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean {
  return !e.ctrlKey && !e.metaKey && !e.altKey
}

/** Apple keyboards have no Ctrl or Alt in those places: the help and the hints say ⌘ and ⌥ (FR-029). */
const isMac: boolean =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** How a row's keys are shown on this machine. */
export const keyLabel = (keys: string): string =>
  isMac ? keys.replace(/\bCtrl\b/g, '⌘').replace(/\bAlt\b/g, '⌥') : keys
