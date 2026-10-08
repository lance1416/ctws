import { describe, expect, it } from 'vitest'
import { calendarQuery, reviewQuery } from './task'
import { createMeetingBody, meetingListQuery } from './meeting'

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
  it('takes the shapes a person schedules, and does not judge the rest', () => {
    // The CONTRACT only bounds the length. Whether a rule is usable is decided by the library
    // that will expand it, because a regex here would be a second parser that disagrees with it.
    for (const rrule of [
      'FREQ=DAILY',
      'FREQ=WEEKLY;BYDAY=TU',
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU',
      'FREQ=MONTHLY;BYMONTHDAY=8',
    ]) {
      expect(createMeetingBody.safeParse({ ...BASE, rrule }).success, rrule).toBe(true)
    }
  })

  it('refuses a rule longer than any rule is', () => {
    expect(createMeetingBody.safeParse({ ...BASE, rrule: 'A'.repeat(501) }).success).toBe(false)
  })
})

describe('when a meeting can start', () => {
  it('refuses a year nobody is meeting in', () => {
    // A daily series starting in year 1 makes the expansion walk from there to the window on
    // every read: 64ms for one series against 3ms for a normal one, paid per series per request.
    expect(createMeetingBody.safeParse({ ...BASE, startsLocal: '0001-01-01T09:00' }).success).toBe(
      false,
    )
    expect(createMeetingBody.safeParse({ ...BASE, startsLocal: '9999-01-01T09:00' }).success).toBe(
      false,
    )
    expect(createMeetingBody.safeParse({ ...BASE, startsLocal: '2026-10-20T09:00' }).success).toBe(
      true,
    )
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

  it('bounds the meeting list the SAME way, not its own way', () => {
    // These two are one question with the days named differently, and they drifted apart once:
    // the calendar was bounded and the list was not, so the walk one refused the other allowed.
    for (const q of [
      { from: '9000-10-01', to: '9000-11-15' },
      { from: '2026-01-01', to: '3026-01-01' },
      { from: '2026-11-01', to: '2026-10-01' },
    ]) {
      expect(calendarQuery.safeParse(q).success, JSON.stringify(q)).toBe(false)
      expect(meetingListQuery.safeParse(q).success, JSON.stringify(q)).toBe(false)
      expect(reviewQuery.safeParse(q).success, JSON.stringify(q)).toBe(false)
    }
  })

  it('refuses a window nobody is looking at, however narrow', () => {
    // The distance to a window is work too: a series is expanded from its own start forward to it.
    expect(calendarQuery.safeParse({ from: '9000-10-01', to: '9000-11-15' }).success).toBe(false)
    expect(calendarQuery.safeParse({ from: '1900-01-01', to: '1900-02-01' }).success).toBe(false)
  })

  it('refuses a window that ends before it starts', () => {
    expect(calendarQuery.safeParse({ from: '2026-11-01', to: '2026-10-01' }).success).toBe(false)
  })
})
