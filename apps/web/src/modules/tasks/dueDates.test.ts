// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'

// Fixed non-UTC zone (+05:30, no DST), so the tests prove something on a UTC CI host too.
beforeAll(() => {
  process.env.TZ = 'Asia/Kolkata'
})

const load = () => import('./dueDates')
const TZ = 'Asia/Kolkata'

describe('overdue label', () => {
  it('counts calendar days in the account zone, not elapsed milliseconds', async () => {
    const { overdueLabel } = await load()
    // Due 23:30 on the 3rd (+05:30); it is 00:10 on the 4th. Forty minutes, but already a day late.
    expect(overdueLabel('2026-10-03T18:00:00.000Z', TZ, new Date('2026-10-03T18:40:00.000Z'))).toBe(
      '1 day late',
    )
    expect(overdueLabel('2026-10-01T03:30:00.000Z', TZ, new Date('2026-10-04T10:00:00.000Z'))).toBe(
      '3 days late',
    )
    // 24h40m after a 23:30 deadline is two calendar days; dividing by a day's milliseconds says one.
    expect(overdueLabel('2026-10-03T18:00:00.000Z', TZ, new Date('2026-10-04T18:40:00.000Z'))).toBe(
      '2 days late',
    )
  })

  it('never says 0 days, and never prints the datetime-local format', async () => {
    const { overdueLabel } = await load()
    const label = overdueLabel('2026-10-03T03:00:00.000Z', TZ, new Date('2026-10-03T10:00:00.000Z'))
    expect(label).toBe('1 day late')
    expect(label).not.toMatch(/T/)
  })
})
