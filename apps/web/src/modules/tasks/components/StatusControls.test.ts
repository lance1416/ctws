import { describe, expect, it } from 'vitest'
import { statusForKey } from './StatusControls'

describe('statusForKey', () => {
  it('the keys x and s map to them, and any modifier means it is not ours', () => {
    const k = (key: string, mods: object = {}) => ({
      key,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      ...mods,
    })
    expect(statusForKey(k('x'), 'todo')).toBe('done')
    expect(statusForKey(k('x'), 'done')).toBe('backlog')
    expect(statusForKey(k('s'), 'todo')).toBe('in_progress')
    expect(statusForKey(k('q'), 'todo')).toBeNull()
    for (const m of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey'])
      expect(statusForKey(k('x', { [m]: true }), 'todo')).toBeNull()
  })
})
