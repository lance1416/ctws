import { describe, expect, it } from 'vitest'
import { isSingleKey, pressOf, singleKeysOf, type KeyTable } from './keyTable'

const event = (key: string, mods: object = {}) => ({
  key,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods,
})

describe('a press', () => {
  it('names the held modifiers in one order', () => {
    expect(pressOf(event('ArrowUp', { altKey: true, ctrlKey: true }))).toBe('Ctrl+Alt+ArrowUp')
    expect(pressOf(event('Enter', { shiftKey: true }))).toBe('Shift+Enter')
  })

  it('leaves Shift out of a character, which already says it', () => {
    // `?` is Shift+/, so a table that wrote `Shift+?` could never be pressed.
    expect(pressOf(event('?', { shiftKey: true }))).toBe('?')
  })

  it('is a single key only as a character with nothing else held', () => {
    expect(isSingleKey(pressOf(event('j')))).toBe(true)
    expect(isSingleKey(pressOf(event('j', { ctrlKey: true })))).toBe(false)
    expect(isSingleKey(pressOf(event('Enter')))).toBe(false)
  })
})

describe('the single keys of tables', () => {
  it('are listed once each, in table order, without the named keys', () => {
    const tables: KeyTable[] = [
      { title: 'A', rows: [{ keys: 'n', does: '', presses: { n: 'new', Enter: 'open' } }] },
      { title: 'B', rows: [{ keys: 'n x', does: '', presses: { x: 'done', n: 'new' } }] },
    ]
    expect(singleKeysOf(tables)).toEqual(['n', 'x'])
  })
})
