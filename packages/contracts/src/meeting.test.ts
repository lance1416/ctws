import { describe, expect, it } from 'vitest'
import { calendarQuery } from './task'
import { createMeetingBody, meetingListQuery, updateMeetingBody } from './meeting'

/**
 * The edge's share of bounding what one request can cost. The expander bounds itself as well --
 * these are the cheap refusals that mean it rarely has to.
 */

const BASE = {
  title: '周会',
  startsLocal: '2026-10-20T09:00',
  timeZone: 'America/Toronto',
  durationMinutes: 60,
}

describe('repeat rules', () => {
  it('takes the shapes a person schedules', () => {
    for (const rrule of [
      'FREQ=DAILY',
      'FREQ=WEEKLY;BYDAY=TU',
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU',
      'FREQ=MONTHLY;BYMONTHDAY=8',
    ]) {
      expect(createMeetingBody.safeParse({ ...BASE, rrule }).success, rrule).toBe(true)
    }
  })

  it('refuses sub-daily frequencies, which nobody schedules and which cost seconds', () => {
    // Measured: FREQ=SECONDLY over a month is 2,646,001 occurrences and 5.5s of one core.
    for (const rrule of ['FREQ=SECONDLY', 'FREQ=MINUTELY;INTERVAL=1', 'freq=hourly']) {
      expect(createMeetingBody.safeParse({ ...BASE, rrule }).success, rrule).toBe(false)
      expect(updateMeetingBody.safeParse({ rrule }).success, rrule).toBe(false)
    }
  })

  it('refuses an interval nobody typed on purpose', () => {
    expect(createMeetingBody.safeParse({ ...BASE, rrule: 'FREQ=DAILY;INTERVAL=0' }).success).toBe(
      false,
    )
    expect(
      createMeetingBody.safeParse({ ...BASE, rrule: 'FREQ=DAILY;INTERVAL=999999' }).success,
    ).toBe(false)
  })
})

describe('windows', () => {
  it('takes the windows the app actually asks for', () => {
    expect(calendarQuery.safeParse({ from: '2026-09-28', to: '2026-11-01' }).success).toBe(true)
    expect(calendarQuery.safeParse({ from: '2026-01-01', to: '2026-12-31' }).success).toBe(true)
  })

  it('refuses a window no screen shows and every series would be expanded over', () => {
    // A recurring thing has no last occurrence, so the window IS the bound.
    expect(calendarQuery.safeParse({ from: '2026-01-01', to: '3026-01-01' }).success).toBe(false)
    expect(meetingListQuery.safeParse({ from: '2026-01-01', to: '3026-01-01' }).success).toBe(false)
  })

  it('refuses a window that ends before it starts', () => {
    expect(calendarQuery.safeParse({ from: '2026-11-01', to: '2026-10-01' }).success).toBe(false)
  })
})
