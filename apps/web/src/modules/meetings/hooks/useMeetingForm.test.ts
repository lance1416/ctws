import { idFrom, meetingId, type MeetingOccurrence } from '@ctws/contracts'
import { describe, expect, it } from 'vitest'
import { createBody, meetingForm, meetingValues, newMeeting, seriesPatch } from './useMeetingForm'

const weekly: MeetingOccurrence = {
  meetingId: idFrom(meetingId, '11111111-1111-4111-8111-111111111111'),
  recurrenceId: '2026-10-20T09:30',
  title: 'Standup',
  startsLocal: '2026-10-20T09:30',
  timeZone: 'Europe/London',
  durationMinutes: 30,
  startsAt: '2026-10-20T08:30:00.000Z',
  endsAt: '2026-10-20T09:00:00.000Z',
  // Ended by a split: the server ends it a minute before, which the form reads as that day.
  rrule: 'FREQ=WEEKLY;BYDAY=TU;UNTIL=20261124T092900Z',
  overridden: false,
  location: null,
  joinUrl: null,
  note: null,
  projectId: null,
  projectName: null,
  attendees: [],
}

describe('the meeting form', () => {
  it('needs a title and both halves of the start', () => {
    const fresh = newMeeting('2026-10-16', 'Asia/Shanghai')
    expect(fresh.startsLocal).toBe('2026-10-16T10:00')
    expect(meetingForm.safeParse(fresh).success).toBe(false)
    expect(meetingForm.safeParse({ ...fresh, title: 'Plan' }).success).toBe(true)
    expect(meetingForm.safeParse({ ...fresh, title: 'Plan', startsLocal: 'T10:00' }).success).toBe(
      false,
    )
    expect(
      meetingForm.safeParse({ ...fresh, title: 'Plan', startsLocal: '2026-10-16T' }).success,
    ).toBe(false)
  })

  it('creates with what is empty left out', () => {
    const fresh = { ...newMeeting('2026-10-16', 'Asia/Shanghai'), title: ' Plan ', location: ' ' }
    expect(createBody(fresh)).toEqual({
      title: 'Plan',
      startsLocal: '2026-10-16T10:00',
      timeZone: 'Asia/Shanghai',
      durationMinutes: 60,
    })
  })

  it('leaves the rule and the time out of a patch that does not change them', () => {
    const patch = seriesPatch({ ...meetingValues(weekly), title: 'Daily' }, weekly)
    expect(patch).toEqual({
      title: 'Daily',
      timeZone: 'Europe/London',
      location: null,
      projectId: null,
      attendeeIds: [],
      note: null,
    })
  })

  it('sends the rule with its ending, and the start, once either changes', () => {
    const patch = seriesPatch(
      { ...meetingValues(weekly), until: '2026-12-01', startsLocal: '2026-10-20T10:00' },
      weekly,
    )
    expect(patch.rrule).toMatch(/^FREQ=WEEKLY;BYDAY=TU;UNTIL=20261201/)
    expect(patch.startsLocal).toBe('2026-10-20T10:00')
    expect(patch.durationMinutes).toBeUndefined()
  })
})
