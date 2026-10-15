/**
 * Whether the event comes from somewhere the user is typing, a contenteditable host included.
 * Every single-key shortcut asks, or `/` and `g` could not be typed into the capture box.
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
