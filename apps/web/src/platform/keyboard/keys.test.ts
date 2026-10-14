import { describe, expect, it } from 'vitest'
import { isBareKey, isTypingTarget } from './keys'

const el = (tagName: string, contentEditable = false) =>
  ({ tagName, isContentEditable: contentEditable }) as unknown as EventTarget

describe('isTypingTarget', () => {
  it('is true for the three form fields', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) expect(isTypingTarget(el(tag))).toBe(true)
  })

  it('is true for a contenteditable host that is not a form field', () => {
    // The case a tag-name-only guard misses: a rich text area is an input that is not an <input>,
    // and getting this wrong means a shortcut eats a letter the person was typing.
    expect(isTypingTarget(el('DIV', true))).toBe(true)
  })

  it('is false for a button, the tree row focus carrier', () => {
    expect(isTypingTarget(el('BUTTON'))).toBe(false)
  })

  it('is false for no target at all', () => {
    expect(isTypingTarget(null)).toBe(false)
  })
})

describe('isBareKey', () => {
  it('rejects Ctrl, Meta and Alt but allows Shift', () => {
    const base = { ctrlKey: false, metaKey: false, altKey: false }
    // Shift must pass: `?` IS Shift+/ on every layout, so rejecting Shift would make the help
    // overlay unreachable while looking like a stricter guard.
    expect(isBareKey(base)).toBe(true)
    expect(isBareKey({ ...base, ctrlKey: true })).toBe(false)
    expect(isBareKey({ ...base, metaKey: true })).toBe(false)
    expect(isBareKey({ ...base, altKey: true })).toBe(false)
  })
})
