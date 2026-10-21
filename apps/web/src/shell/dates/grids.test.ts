import { describe, expect, it } from 'vitest'
import { addMonths, lunarMonthAround } from './grids'

/** Day names as the server gives them: the month on its first day only. */
const labels = (starts: [string, string][], last: string): Record<string, string> => {
  const out: Record<string, string> = {}
  const names = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十']
  for (let i = 0; i < starts.length; i++) {
    const [start, month] = starts[i]!
    const end = starts[i + 1]?.[0] ?? last
    let d = start
    let n = 0
    while (d < end) {
      out[d] = n === 0 ? `${month}初一` : (names[n] ?? `${n + 1}`)
      n++
      const next = new Date(`${d}T00:00:00Z`)
      next.setUTCDate(next.getUTCDate() + 1)
      d = next.toISOString().slice(0, 10)
    }
  }
  return out
}

describe('the lunar month around a solar day', () => {
  // Three month starts: the middle month is the one around the anchor.
  const days = labels(
    [
      ['2026-10-10', '九月'],
      ['2026-11-09', '十月'],
      ['2026-12-09', '十一月'],
    ],
    '2026-12-20',
  )

  it('finds the month, its name and its days in order', () => {
    const month = lunarMonthAround(days, '2026-11-20')
    expect(month?.name).toBe('十月')
    expect(month?.days).toHaveLength(30)
    expect(month?.days[0]).toEqual({ solar: '2026-11-09', name: '初一' })
    expect(month?.days[1]).toEqual({ solar: '2026-11-10', name: '初二' })
  })

  it('keeps a leap month as its own month, named so', () => {
    const leap = labels(
      [
        ['2027-05-06', '四月'],
        ['2027-06-05', '闰四月'],
        ['2027-07-04', '五月'],
      ],
      '2027-07-20',
    )
    expect(lunarMonthAround(leap, '2027-06-20')?.name).toBe('闰四月')
  })

  it('answers nothing when the window does not hold the whole month', () => {
    expect(lunarMonthAround(days, '2026-12-15')).toBeNull()
    expect(lunarMonthAround(days, '2026-10-01')).toBeNull()
  })
})

it('steps months across a year end', () => {
  expect(addMonths('2026-12', 1)).toBe('2027-01')
  expect(addMonths('2026-01', -1)).toBe('2025-12')
})
