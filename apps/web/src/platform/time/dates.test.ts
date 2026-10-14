// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'

// Fixed non-UTC zone (+05:30, no DST), so the tests prove something on a UTC CI host too.
beforeAll(() => {
  process.env.TZ = 'Asia/Kolkata'
})

const load = () => import('./dates')

/** The account's zone; it equals the process TZ here, and `dateHints.test.ts` separates the two. */
const TZ = 'Asia/Kolkata'

describe('due time conversion', () => {
  it('reads a wall-clock value as the matching instant', async () => {
    const { fromDayTimeInput } = await load()
    // 02:30 on the 3rd in +05:30 is 21:00 UTC on the 2nd.
    expect(fromDayTimeInput('2026-10-03T02:30', TZ)).toBe('2026-10-02T21:00:00.000Z')
  })

  it('shows an instant as wall-clock time', async () => {
    const { toDayTimeInput } = await load()
    expect(toDayTimeInput('2026-10-02T21:00:00.000Z', TZ)).toBe('2026-10-03T02:30')
  })

  it('maps empty to null and back to the empty string', async () => {
    const { fromDayTimeInput, toDayTimeInput } = await load()
    expect(fromDayTimeInput('', TZ)).toBeNull()
    expect(toDayTimeInput(null, TZ)).toBe('')
  })

  it('reads the field in the ACCOUNT’s zone, not the browser’s', async () => {
    const { fromDayTimeInput, toDayTimeInput } = await load()
    // The process sits in +05:30; the account is in New York, where 02:30 on the 3rd is 06:30 UTC.
    expect(fromDayTimeInput('2026-10-03T02:30', 'America/New_York')).toBe(
      '2026-10-03T06:30:00.000Z',
    )
    expect(toDayTimeInput('2026-10-03T06:30:00.000Z', 'America/New_York')).toBe('2026-10-03T02:30')
  })
})

describe('shortDay', () => {
  it('writes month and day within the year, and the year across it', async () => {
    const { shortDay } = await load()
    expect(shortDay('2026-10-12', '2026-10-10')).toBe('Oct 12')
    expect(shortDay('2027-04-15', '2026-10-10')).toBe('Apr 15, 2027')
  })

  it('says only month and day for today as well', async () => {
    const { shortDay } = await load()
    expect(shortDay('2026-10-10', '2026-10-10')).toBe('Oct 10')
  })
})

describe('countdownPhrase', () => {
  it('names zero today and one tomorrow, and counts the rest', async () => {
    const { countdownPhrase } = await load()
    expect(countdownPhrase(0)).toBe('today')
    expect(countdownPhrase(1)).toBe('tomorrow')
    expect(countdownPhrase(2)).toBe('in 2 days')
    expect(countdownPhrase(118)).toBe('in 118 days')
  })
})
