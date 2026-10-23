import { describe, expect, it } from 'vitest'
import { leastUsedColor } from './colors'

describe('leastUsedColor', () => {
  it('gives the first colour nobody has yet', () => {
    expect(leastUsedColor([])).toBe('blue')
    expect(leastUsedColor(['blue', 'amber', 'violet'])).toBe('green')
  })

  it('once all eight are taken, gives the least used, earliest in the list', () => {
    const all = ['blue', 'amber', 'green', 'violet', 'red', 'olive', 'teal', 'pink'] as const
    expect(leastUsedColor([...all, 'blue', 'amber', 'red'])).toBe('green')
  })
})
