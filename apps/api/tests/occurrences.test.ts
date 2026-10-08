import { describe, expect, it } from 'vitest'
import {
  endedBefore,
  instantOf,
  isUsableRule,
  localOf,
  occurrencesIn,
  type Exception,
  type Series,
} from '../src/meetings/occurrences'

/**
 * EXPANDING A RECURRENCE, in the meeting's own zone.
 *
 * The cases below are the ones that break a hand-rolled implementation, and two of them are the
 * reason this exists at all: a weekly meeting in Toronto and a weekly meeting in London, each
 * across its own DST change. They change on DIFFERENT dates, so "the server's offset" is wrong
 * for at least one of them for several weeks a year.
 *
 * No database: this is arithmetic, and arithmetic that needs a container is arithmetic nobody
 * runs often enough.
 */

const weekly = (overrides: Partial<Series> = {}): Series => ({
  startsLocal: '2026-10-20T09:00',
  timeZone: 'America/Toronto',
  durationMinutes: 60,
  rrule: 'FREQ=WEEKLY;BYDAY=TU',
  ...overrides,
})

const window = (from: string, to: string) => ({ from: new Date(from), to: new Date(to) })
const none: Exception[] = []

describe('one-off meetings', () => {
  it('is in the window when it overlaps it, not only when it is inside it', () => {
    // A meeting that started before the window and runs into it is happening during it.
    const series = weekly({ rrule: null, startsLocal: '2026-10-20T09:00', durationMinutes: 120 })
    const during = occurrencesIn(series, none, window('2026-10-20T14:00Z', '2026-10-20T15:00Z'))
    expect(during).toHaveLength(1)
    // 09:00 Toronto in October is 13:00Z; it ends at 15:00Z, so a window starting then misses it.
    expect(occurrencesIn(series, none, window('2026-10-20T15:00Z', '2026-10-20T16:00Z'))).toEqual(
      [],
    )
  })

  it('turns its wall clock into the instant that zone means', () => {
    const [one] = occurrencesIn(
      weekly({ rrule: null }),
      none,
      window('2026-10-01T00:00Z', '2026-11-01T00:00Z'),
    )
    // 2026-10-20 is EDT (UTC-4), so 09:00 local is 13:00Z.
    expect(one!.startsAt.toISOString()).toBe('2026-10-20T13:00:00.000Z')
    expect(one!.endsAt.toISOString()).toBe('2026-10-20T14:00:00.000Z')
  })
})

describe('a weekly meeting across a DST change', () => {
  it('stays at 09:00 in TORONTO, and the instant moves', () => {
    // THE WHOLE POINT. Toronto leaves EDT on 2026-11-01. A series stored as an instant and
    // advanced by seven days would hold 13:00Z and move the meeting to 08:00 for the people in
    // the room.
    const got = occurrencesIn(weekly(), none, window('2026-10-20T00:00Z', '2026-11-18T00:00Z'))
    expect(got.map((o) => o.startsLocal)).toEqual([
      '2026-10-20T09:00',
      '2026-10-27T09:00',
      '2026-11-03T09:00',
      '2026-11-10T09:00',
      '2026-11-17T09:00',
    ])
    expect(got.map((o) => o.startsAt.toISOString())).toEqual([
      '2026-10-20T13:00:00.000Z',
      '2026-10-27T13:00:00.000Z',
      // EST from here: the same 09:00, an hour later in UTC.
      '2026-11-03T14:00:00.000Z',
      '2026-11-10T14:00:00.000Z',
      '2026-11-17T14:00:00.000Z',
    ])
  })

  it('stays at 09:00 in LONDON, which changes on a different day', () => {
    // Britain leaves BST on 2026-10-25, a week before Toronto leaves EDT. One server offset
    // cannot be right for both, which is why the zone is the event's and not the account's.
    const got = occurrencesIn(
      weekly({ timeZone: 'Europe/London' }),
      none,
      window('2026-10-20T00:00Z', '2026-11-04T00:00Z'),
    )
    expect(got.map((o) => o.startsAt.toISOString())).toEqual([
      '2026-10-20T08:00:00.000Z',
      // GMT from here.
      '2026-10-27T09:00:00.000Z',
      '2026-11-03T09:00:00.000Z',
    ])
    expect(new Set(got.map((o) => o.startsLocal.slice(11)))).toEqual(new Set(['09:00']))
  })

  it('keeps the two zones apart in the same window', () => {
    const toronto = occurrencesIn(weekly(), none, window('2026-10-27T00:00Z', '2026-10-28T00:00Z'))
    const london = occurrencesIn(
      weekly({ timeZone: 'Europe/London' }),
      none,
      window('2026-10-27T00:00Z', '2026-10-28T00:00Z'),
    )
    // Same wall clock, same day, one hour apart in reality -- the week between the two changes.
    expect(toronto[0]!.startsAt.toISOString()).toBe('2026-10-27T13:00:00.000Z')
    expect(london[0]!.startsAt.toISOString()).toBe('2026-10-27T09:00:00.000Z')
  })
})

describe('exceptions', () => {
  it('drops a cancelled occurrence and keeps the rest', () => {
    const got = occurrencesIn(
      weekly(),
      [
        {
          recurrenceId: '2026-10-27T09:00',
          cancelled: true,
          startsLocal: null,
          durationMinutes: null,
        },
      ],
      window('2026-10-20T00:00Z', '2026-11-04T00:00Z'),
    )
    expect(got.map((o) => o.recurrenceId)).toEqual(['2026-10-20T09:00', '2026-11-03T09:00'])
  })

  it('moves one occurrence without moving the series', () => {
    const got = occurrencesIn(
      weekly(),
      [
        {
          recurrenceId: '2026-10-27T09:00',
          cancelled: false,
          startsLocal: '2026-10-27T14:00',
          durationMinutes: 30,
        },
      ],
      window('2026-10-20T00:00Z', '2026-11-04T00:00Z'),
    )
    const moved = got.find((o) => o.recurrenceId === '2026-10-27T09:00')!
    expect(moved.startsLocal).toBe('2026-10-27T14:00')
    expect(moved.durationMinutes).toBe(30)
    // The ones around it are untouched.
    expect(got.filter((o) => o.startsLocal.endsWith('T09:00'))).toHaveLength(2)
  })

  it('finds an occurrence that was MOVED INTO the window from well outside it', () => {
    // 「这周的会推到下周一」. The rule produces nothing anywhere near this window, so walking the
    // rule alone -- even with the slack the zone conversion needs -- would miss it, and the
    // meeting would simply not be on the day it was moved to.
    const got = occurrencesIn(
      weekly(),
      [
        {
          recurrenceId: '2026-10-27T09:00',
          cancelled: false,
          startsLocal: '2026-11-02T09:00',
          durationMinutes: 60,
        },
      ],
      window('2026-11-02T00:00Z', '2026-11-03T00:00Z'),
    )
    expect(got.map((o) => o.startsLocal)).toEqual(['2026-11-02T09:00'])
  })

  it('does not report a moved occurrence twice', () => {
    // It is reachable both by walking the rule and by the sweep that catches moves from outside;
    // a window holding both the old time and the new one must still show one meeting.
    const got = occurrencesIn(
      weekly(),
      [
        {
          recurrenceId: '2026-10-27T09:00',
          cancelled: false,
          startsLocal: '2026-10-28T09:00',
          durationMinutes: 60,
        },
      ],
      window('2026-10-26T00:00Z', '2026-10-30T00:00Z'),
    )
    expect(got.map((o) => o.startsLocal)).toEqual(['2026-10-28T09:00'])
  })

  it('keeps the occurrences in time order after a move', () => {
    const got = occurrencesIn(
      weekly(),
      [
        {
          recurrenceId: '2026-10-20T09:00',
          cancelled: false,
          startsLocal: '2026-10-29T09:00',
          durationMinutes: 60,
        },
      ],
      window('2026-10-19T00:00Z', '2026-11-04T00:00Z'),
    )
    const times = got.map((o) => o.startsAt.getTime())
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })
})

describe('rules', () => {
  it('takes the shapes a person actually schedules', () => {
    for (const rule of [
      'FREQ=DAILY',
      'FREQ=WEEKLY;BYDAY=TU',
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU',
      'FREQ=MONTHLY;BYMONTHDAY=8',
      'FREQ=MONTHLY;BYDAY=-1FR',
      'FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10',
    ]) {
      expect(isUsableRule(rule), rule).toBe(true)
    }
  })

  it('refuses a rule that parses but schedules nothing, and one that does not parse', () => {
    expect(isUsableRule('FREQ=WEEKLY;COUNT=0')).toBe(false)
    expect(isUsableRule('every other tuesday')).toBe(false)
    expect(isUsableRule('')).toBe(false)
  })

  it('counts every other week as every other week', () => {
    const got = occurrencesIn(
      weekly({ rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU' }),
      none,
      window('2026-10-20T00:00Z', '2026-11-18T00:00Z'),
    )
    expect(got.map((o) => o.startsLocal.slice(0, 10))).toEqual([
      '2026-10-20',
      '2026-11-03',
      '2026-11-17',
    ])
  })

  it('stops where COUNT says, even in an open window', () => {
    const got = occurrencesIn(
      weekly({ rrule: 'FREQ=WEEKLY;BYDAY=TU;COUNT=2' }),
      none,
      window('2026-10-01T00:00Z', '2027-10-01T00:00Z'),
    )
    expect(got).toHaveLength(2)
  })

  it('reports the one meeting rather than nothing when a stored rule is unreadable', () => {
    // A calendar that renders nothing because one row is corrupt is worse than one that shows the
    // meeting it can still describe.
    const got = occurrencesIn(
      weekly({ rrule: 'FREQ=NONSENSE;;;' }),
      none,
      window('2026-10-01T00:00Z', '2026-11-01T00:00Z'),
    )
    expect(got.map((o) => o.startsLocal)).toEqual(['2026-10-20T09:00'])
  })
})

describe('endedBefore', () => {
  it('stops the old series just before the occurrence the split starts at', () => {
    const rule = endedBefore('FREQ=WEEKLY;BYDAY=TU', '2026-11-03T09:00')
    expect(rule).toBe('FREQ=WEEKLY;BYDAY=TU;UNTIL=20261103T085900Z')
    const got = occurrencesIn(
      weekly({ rrule: rule }),
      none,
      window('2026-10-01T00:00Z', '2026-12-01T00:00Z'),
    )
    expect(got.map((o) => o.startsLocal.slice(0, 10))).toEqual(['2026-10-20', '2026-10-27'])
  })

  it('replaces an existing UNTIL or COUNT rather than adding a second one', () => {
    expect(endedBefore('FREQ=WEEKLY;COUNT=10;BYDAY=TU', '2026-11-03T09:00')).toBe(
      'FREQ=WEEKLY;BYDAY=TU;UNTIL=20261103T085900Z',
    )
    expect(endedBefore('FREQ=WEEKLY;UNTIL=20270101T000000Z', '2026-11-03T09:00')).toBe(
      'FREQ=WEEKLY;UNTIL=20261103T085900Z',
    )
  })
})

describe('wall clocks and instants', () => {
  it('round-trips through a zone', () => {
    expect(localOf(instantOf('2026-10-20T09:00', 'America/Toronto'), 'America/Toronto')).toBe(
      '2026-10-20T09:00',
    )
    expect(localOf(instantOf('2026-07-01T23:30', 'Europe/London'), 'Europe/London')).toBe(
      '2026-07-01T23:30',
    )
  })

  it('resolves a clock the spring-forward skips rather than failing', () => {
    // 2026-03-08 02:30 does not exist in Toronto. A meeting booked into the gap lands after the
    // jump, which is what every calendar does with one.
    const at = instantOf('2026-03-08T02:30', 'America/Toronto')
    expect(Number.isNaN(at.getTime())).toBe(false)
    expect(at.toISOString()).toBe('2026-03-08T07:30:00.000Z')
  })
})
