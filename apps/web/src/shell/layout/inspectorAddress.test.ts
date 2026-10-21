import { describe, expect, it } from 'vitest'
import { formatInspect, parseInspect } from './inspectorAddress'

describe("the inspector's address", () => {
  it('round-trips a thing', () => {
    const thing = { type: 'meeting' as const, id: '1b2c3d4e-0000-4000-8000-000000000000' }
    expect(parseInspect(formatInspect(thing))).toEqual(thing)
  })

  it('ignores what is not a thing', () => {
    expect(parseInspect(null)).toBeNull()
    expect(parseInspect('')).toBeNull()
    expect(parseInspect('meeting')).toBeNull()
    expect(parseInspect(':abc')).toBeNull()
    expect(parseInspect('dragon:abc')).toBeNull()
  })
})
