import { describe, expect, it } from 'vitest'
import { HOUR_BRANCHES, LUNAR_DAYS, LUNAR_MONTHS } from './names'

describe('the name tables', () => {
  it('hold twelve double-hours, twelve months and thirty days', () => {
    expect(HOUR_BRANCHES).toHaveLength(12)
    expect(HOUR_BRANCHES[0]).toBe('子时 · 23–01')
    expect(HOUR_BRANCHES[11]).toBe('亥时 · 21–23')
    expect(LUNAR_MONTHS).toHaveLength(12)
    expect(LUNAR_MONTHS[0]).toBe('正月')
    expect(LUNAR_MONTHS[11]).toBe('十二月')
    expect(LUNAR_DAYS).toHaveLength(30)
  })
})
