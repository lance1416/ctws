// @vitest-environment node
import { addDays } from '@ctws/core/day'
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

describe('weekdayOf', () => {
  it('names the weekday a day falls on, in full or short', async () => {
    const { weekdayOf } = await load()
    expect(weekdayOf('2026-10-19')).toBe('Monday')
    expect(weekdayOf('2026-10-19', true)).toBe('Mon')
    expect(weekdayOf('2026-10-18', true)).toBe('Sun')
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

describe('nearDay', () => {
  it('names the three days around today and nothing else', async () => {
    const { nearDay } = await load()
    expect(nearDay('2026-10-10', '2026-10-10')).toBe('Today')
    expect(nearDay('2026-10-11', '2026-10-10')).toBe('Tomorrow')
    expect(nearDay('2026-10-09', '2026-10-10')).toBe('Yesterday')
    expect(nearDay('2026-10-12', '2026-10-10')).toBeNull()
  })
})

describe('weekdayDay and longDay', () => {
  it('write the weekday before the date, the year only across it', async () => {
    const { weekdayDay, longDay } = await load()
    expect(weekdayDay('2026-10-02', '2026-10-10')).toBe('Fri, Oct 2')
    expect(weekdayDay('2027-01-01', '2026-12-30')).toBe('Fri, Jan 1, 2027')
    expect(longDay('2026-10-02')).toBe('Friday, October 2')
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

describe('calendar arithmetic', () => {
  it('next Monday is always strictly later, from any weekday', async () => {
    const { nextMonday } = await load()
    expect(nextMonday('2026-10-03')).toBe('2026-10-05') // Saturday -> Monday
    expect(nextMonday('2026-10-04')).toBe('2026-10-05') // Sunday -> Monday
    expect(nextMonday('2026-10-05')).toBe('2026-10-12') // Monday -> a week on, not itself
    expect(nextMonday('2026-10-07')).toBe('2026-10-12') // Wednesday
  })

  it('says today / tomorrow / yesterday, else the date', async () => {
    const { dayPhrase } = await load()
    expect(dayPhrase('2026-10-03', '2026-10-03')).toBe('Today')
    expect(dayPhrase('2026-10-04', '2026-10-03')).toBe('Tomorrow')
    expect(dayPhrase('2026-10-02', '2026-10-03')).toBe('Yesterday')
    expect(dayPhrase('2026-10-08', '2026-10-03')).toBe('Oct 8')
    expect(dayPhrase('2027-01-02', '2026-10-03')).toBe('Jan 2, 2027')
  })
})

/**
 * The account's today is the only today. The browser is in Kolkata and the account in New York,
 * which disagree about the day at the instant below.
 */
describe('the account timezone decides, even when the browser is in another one', () => {
  const ACCOUNT = 'America/New_York'
  // 02:00 UTC on the 5th: 07:30 on the 5th in Kolkata, but still 22:00 on the 4th in New York.
  const NOW_CROSS = new Date('2026-10-05T02:00:00.000Z')

  it('today, tomorrow and next Monday are the account days', async () => {
    const { nextMonday, ymd } = await load()
    expect(ymd(NOW_CROSS, ACCOUNT)).toBe('2026-10-04')
    expect(addDays(ymd(NOW_CROSS, ACCOUNT), 1)).toBe('2026-10-05')
    // The 4th is a Sunday in New York while the browser is on Monday the 5th: next week from
    // there is the 5th, not the 12th.
    expect(nextMonday(ymd(NOW_CROSS, ACCOUNT))).toBe('2026-10-05')
  })

  it('the end of the day is the end of the account day', async () => {
    const { dayEndIso } = await load()
    // 23:59 on the 4th in New York (EDT, -04:00) is 03:59 UTC on the 5th; the browser's zone would
    // have made it 18:29 UTC on the 4th, a different instant and the wrong day there.
    expect(dayEndIso('2026-10-04', ACCOUNT)).toBe('2026-10-05T03:59:00.000Z')
  })
})

// Across a DST boundary a local day is 23 or 25 hours long.
describe('days across a DST boundary', () => {
  const NY = 'America/New_York'

  it('day-string arithmetic steps over the short and the long day', async () => {
    const { nextMonday } = await load()
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08')
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
    expect(addDays('2026-03-09', -1)).toBe('2026-03-08')
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02')
    // 2026-03-08 is a Sunday; the Monday after it is the 9th, short day or not.
    expect(nextMonday('2026-03-08')).toBe('2026-03-09')
  })

  it('the end of a short day is still 23:59 there', async () => {
    const { dayEndIso } = await load()
    expect(dayEndIso('2026-03-08', NY)).toBe('2026-03-09T03:59:00.000Z')
    expect(dayEndIso('2026-11-01', NY)).toBe('2026-11-02T04:59:00.000Z')
  })
})
