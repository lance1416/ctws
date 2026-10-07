// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'

// Fixed non-UTC zone (+05:30, no DST), so the tests prove something on a UTC CI host too.
beforeAll(() => {
  process.env.TZ = 'Asia/Kolkata'
})

const loadLabel = () => import('./dueAt')

/**
 * The ACCOUNT's zone. It happens to equal the process `TZ` in this file, which is what makes the
 * conversions below readable; the cases that prove the two are not the same thing, and that the
 * account's is the one that wins, live in `dateHints.test.ts`.
 */
const TZ = 'Asia/Kolkata'

describe('due time conversion', () => {
  it('reads a wall-clock value as the matching instant', async () => {
    const { fromDayTimeInput } = await loadLabel()
    // 02:30 on the 3rd in +05:30 is 21:00 UTC on the 2nd.
    expect(fromDayTimeInput('2026-10-03T02:30', TZ)).toBe('2026-10-02T21:00:00.000Z')
  })

  it('shows an instant as wall-clock time', async () => {
    const { toDayTimeInput } = await loadLabel()
    expect(toDayTimeInput('2026-10-02T21:00:00.000Z', TZ)).toBe('2026-10-03T02:30')
  })

  it('maps empty to null and back to the empty string', async () => {
    const { fromDayTimeInput, toDayTimeInput } = await loadLabel()
    expect(fromDayTimeInput('', TZ)).toBeNull()
    expect(toDayTimeInput(null, TZ)).toBe('')
  })

  it('reads the field in the ACCOUNT’s zone, not the browser’s', async () => {
    const { fromDayTimeInput, toDayTimeInput } = await loadLabel()
    // The process sits in +05:30; the account is in New York. 02:30 on the 3rd means 02:30 THERE,
    // which is 06:30 UTC -- not the 21:00 UTC of the 2nd that the browser's zone would give. A
    // `datetime-local` value carries no zone, so this is the whole content of the decision.
    expect(fromDayTimeInput('2026-10-03T02:30', 'America/New_York')).toBe(
      '2026-10-03T06:30:00.000Z',
    )
    expect(toDayTimeInput('2026-10-03T06:30:00.000Z', 'America/New_York')).toBe('2026-10-03T02:30')
  })
})

describe('overdue label', () => {
  it('counts calendar days in the account zone, not elapsed milliseconds', async () => {
    const { overdueLabel } = await loadLabel()
    // Due 23:30 on the 3rd (+05:30); it is 00:10 on the 4th. Forty minutes, but already a day late.
    expect(overdueLabel('2026-10-03T18:00:00.000Z', TZ, new Date('2026-10-03T18:40:00.000Z'))).toBe(
      '已逾 1 天',
    )
    expect(overdueLabel('2026-10-01T03:30:00.000Z', TZ, new Date('2026-10-04T10:00:00.000Z'))).toBe(
      '已逾 3 天',
    )
  })

  it('never says 0 days, and never prints the datetime-local format', async () => {
    const { overdueLabel } = await loadLabel()
    const label = overdueLabel('2026-10-03T03:00:00.000Z', TZ, new Date('2026-10-03T10:00:00.000Z'))
    expect(label).toBe('已逾 1 天')
    expect(label).not.toMatch(/T/)
  })
})
