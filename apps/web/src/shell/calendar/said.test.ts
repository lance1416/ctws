import type { CalendarEntry } from '@ctws/contracts'
import { describe, expect, it } from 'vitest'
import { said } from './said'

const meeting = (startsAt: string, endsAt: string): CalendarEntry => ({
  type: 'meeting',
  id: 'm1',
  kind: 'occurrence',
  recurrenceId: '2026-10-20T09:00',
  day: startsAt.slice(0, 10),
  title: '周会',
  startsAt,
  endsAt,
  timeZone: 'America/Toronto',
  turns: null,
  joinUrl: null,
  done: false,
  repeats: false,
  projectId: null,
  projectName: null,
})

describe('an entry, said', () => {
  it("is on the account's clock, its own zone's time beside it, named for its season", () => {
    // 09:00 in Toronto on either side of its DST change, read from a UTC account.
    const summer = said(meeting('2026-10-27T13:00:00.000Z', '2026-10-27T14:00:00.000Z'), 'UTC')
    expect(summer).toMatchObject({
      time: '13:00',
      endTime: '14:00',
      zone: 'EDT',
      zoneTime: '09:00',
    })
    const winter = said(meeting('2026-11-03T14:00:00.000Z', '2026-11-03T15:00:00.000Z'), 'UTC')
    expect(winter).toMatchObject({
      time: '14:00',
      endTime: '15:00',
      zone: 'EST',
      zoneTime: '09:00',
    })
  })

  it('names no zone when it was agreed in the account’s own', () => {
    const here = said(
      meeting('2026-10-27T13:00:00.000Z', '2026-10-27T14:00:00.000Z'),
      'America/Toronto',
    )
    expect(here).toMatchObject({ time: '09:00', endTime: '10:00', zone: null, zoneTime: null })
  })

  it('has no time for a thing that only has a day', () => {
    const due: CalendarEntry = {
      ...meeting('2026-10-27T13:00:00.000Z', '2026-10-27T14:00:00.000Z'),
      type: 'task',
      kind: 'due',
      recurrenceId: null,
      startsAt: null,
      endsAt: null,
      timeZone: null,
    }
    expect(said(due, 'UTC')).toMatchObject({
      time: null,
      endTime: null,
      zone: null,
      zoneTime: null,
    })
  })
})
