import { describe, expect, it } from 'vitest'
import { lunarFullName } from './lunarName'

describe('lunarFullName', () => {
  const days = {
    '2026-10-09': '八月廿九',
    '2026-10-10': '九月初一',
    '2026-10-11': '初二',
    '2026-10-22': '十三',
  }
  it('names the day with its month', () => {
    expect(lunarFullName(days, '2026-10-22')).toBe('九月十三')
    expect(lunarFullName(days, '2026-10-10')).toBe('九月初一')
  })
  it('says nothing it cannot read', () => {
    expect(lunarFullName(days, '2026-10-23')).toBeNull()
    expect(lunarFullName({ '2026-10-22': '十三' }, '2026-10-22')).toBeNull()
  })
})
