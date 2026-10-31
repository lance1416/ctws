import { describe, expect, it } from 'vitest'
import { actionOf, pressOf } from '../../../platform/keyboard/keyTable'
import { statusActions, TASK_KEYS, TODAY_KEYS, TREE_KEYS } from './keys'

const press = (key: string, mods: object = {}) =>
  pressOf({ key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...mods })

describe('the status keys', () => {
  it('x completes or reopens and s starts or pauses, on a row in the tree or on Today', () => {
    for (const table of [TREE_KEYS, TODAY_KEYS]) {
      expect(actionOf(table, press('x'))).toBe('complete')
      expect(actionOf(table, press('s'))).toBe('start')
      expect(actionOf(table, press('q'))).toBeNull()
    }
    const set: string[] = []
    const run = (status: 'todo' | 'done', action: 'start' | 'complete') =>
      statusActions(status, (next) => set.push(next))[action]()
    run('todo', 'complete')
    run('done', 'complete')
    run('todo', 'start')
    expect(set).toEqual(['done', 'reopen', 'in_progress'])
  })

  it('are not ours with Alt, Ctrl or Meta held', () => {
    for (const m of ['altKey', 'ctrlKey', 'metaKey'])
      expect(actionOf(TREE_KEYS, press('x', { [m]: true }))).toBeNull()
  })
})

describe('the tree keys', () => {
  it('tell Enter, Shift+Enter and Alt+Enter apart', () => {
    expect(actionOf(TREE_KEYS, press('Enter'))).toBe('open')
    expect(actionOf(TREE_KEYS, press('Enter', { shiftKey: true }))).toBe('addSibling')
    expect(actionOf(TREE_KEYS, press('Enter', { altKey: true }))).toBe('addChild')
  })

  it('open the details with Enter whether or not Ctrl or Cmd is held', () => {
    expect(actionOf(TREE_KEYS, press('Enter', { ctrlKey: true }))).toBe('open')
    expect(actionOf(TREE_KEYS, press('Enter', { metaKey: true }))).toBe('open')
    expect(actionOf(TREE_KEYS, press('Enter', { ctrlKey: true, shiftKey: true }))).toBe(
      'addSibling',
    )
    expect(actionOf(TREE_KEYS, press('Enter', { altKey: true, metaKey: true }))).toBe('addChild')
  })

  it('move the row with Alt+arrow whatever else is held', () => {
    expect(actionOf(TREE_KEYS, press('ArrowUp', { altKey: true, shiftKey: true }))).toBe('moveUp')
    expect(actionOf(TREE_KEYS, press('ArrowRight', { altKey: true, ctrlKey: true }))).toBe('indent')
  })

  it('move focus with a bare arrow and the row with Alt', () => {
    expect(actionOf(TREE_KEYS, press('ArrowUp'))).toBe('previous')
    expect(actionOf(TREE_KEYS, press('ArrowUp', { altKey: true }))).toBe('moveUp')
    // Shift+arrow is a selection gesture this table does not own.
    expect(actionOf(TREE_KEYS, press('ArrowUp', { shiftKey: true }))).toBeNull()
  })
})

describe('the help', () => {
  it('lists Today’s row keys with the tree’s, one group (artboard 24)', () => {
    expect(TODAY_KEYS.title).toBe(TREE_KEYS.title)
    expect(TASK_KEYS[0]).toBe(TREE_KEYS)
  })
})
