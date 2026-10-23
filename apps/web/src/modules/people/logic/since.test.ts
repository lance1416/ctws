import { describe, expect, it } from 'vitest'
import { sinceWords } from './since'

describe('sinceWords', () => {
  it('counts whole months, the last one only once its day has come', () => {
    expect(sinceWords('2026-06-22', '2026-10-22')).toBe('4 months')
    expect(sinceWords('2026-06-23', '2026-10-22')).toBe('3 months')
    expect(sinceWords('2026-03-10', '2026-10-22')).toBe('7 months')
  })

  it('says a year, then years', () => {
    expect(sinceWords('2025-10-01', '2026-10-22')).toBe('a year')
    expect(sinceWords('2023-01-05', '2026-10-22')).toBe('3 years')
  })

  it('never says less than a month', () => {
    expect(sinceWords('2026-10-01', '2026-10-22')).toBe('1 month')
  })
})
