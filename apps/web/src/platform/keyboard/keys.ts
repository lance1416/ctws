/**
 * Is this event coming out of somewhere the user is typing? Every document-level single-key
 * shortcut has to ask: without it, `/` or `g` cannot be typed into the capture box, which is
 * worse than having no shortcut at all. `isContentEditable` matters as much as the tag names --
 * a rich-text host is an input that is not an `<input>`.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.isContentEditable === true || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
}

/**
 * A bare key press: no Ctrl / Meta / Alt. Shift is allowed because `?` IS Shift+/ on every
 * layout we care about, and the key name already carries that.
 */
export function isBareKey(e: { ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean {
  return !e.ctrlKey && !e.metaKey && !e.altKey
}
