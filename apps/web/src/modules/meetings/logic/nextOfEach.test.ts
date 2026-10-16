import { idFrom, meetingId, type MeetingOccurrence } from '@ctws/contracts'
import { describe, expect, it } from 'vitest'
import { nextOfEach } from './nextOfEach'

const at = (series: string, startsAt: string, endsAt: string) =>
  ({
    meetingId: idFrom(meetingId, series),
    recurrenceId: startsAt.slice(0, 16),
    startsAt,
    endsAt,
  }) as MeetingOccurrence

const DAILY = '11111111-1111-4111-8111-111111111111'
const ONCE = '22222222-2222-4222-8222-222222222222'

describe('the next occurrence of each series', () => {
  it('skips one that is over for the next, and keeps an ended one only when nothing follows', () => {
    const now = new Date('2026-10-16T15:00:00Z')
    const rows = [
      at(DAILY, '2026-10-16T09:00:00Z', '2026-10-16T09:15:00Z'),
      at(ONCE, '2026-10-16T10:00:00Z', '2026-10-16T11:00:00Z'),
      at(DAILY, '2026-10-17T09:00:00Z', '2026-10-17T09:15:00Z'),
    ]
    expect(nextOfEach(rows, now).map((m) => [m.meetingId, m.startsAt])).toEqual([
      [ONCE, '2026-10-16T10:00:00Z'],
      [DAILY, '2026-10-17T09:00:00Z'],
    ])
  })
})
