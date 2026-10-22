import { describe, expect, it } from 'vitest'
import { carriedFrom, dueMark } from './todayMarks'

// Thursday, October 22, 2026, in London.
const TODAY = '2026-10-22'
const ZONE = 'Europe/London'

describe('what a Today row says about its deadline', () => {
  it('says today, tomorrow, a weekday within the week and a date after it', () => {
    expect(dueMark('2026-10-22T17:00:00.000Z', TODAY, ZONE)).toEqual({
      text: 'Due today',
      tone: 'today',
    })
    expect(dueMark('2026-10-23T22:59:00.000Z', TODAY, ZONE)).toEqual({
      text: 'Tomorrow',
      tone: 'soon',
    })
    expect(dueMark('2026-10-26T12:00:00.000Z', TODAY, ZONE)?.text).toBe('Mon')
    expect(dueMark('2026-11-03T12:00:00.000Z', TODAY, ZONE)?.text).toBe('Nov 3')
    expect(dueMark(null, TODAY, ZONE)).toBeNull()
  })

  it('counts the days late once missed', () => {
    expect(dueMark('2026-10-15T12:00:00.000Z', TODAY, ZONE)).toEqual({
      text: '7 days late',
      tone: 'late',
    })
    expect(dueMark('2026-10-21T12:00:00.000Z', TODAY, ZONE)?.text).toBe('1 day late')
  })

  it('says where a carried plan came from', () => {
    expect(carriedFrom('2026-10-18', TODAY)).toBe('Carried from Sun')
    expect(carriedFrom('2026-10-12', TODAY)).toBe('Carried from Oct 12')
  })
})
