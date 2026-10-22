import { describe, expect, it } from 'vitest'
import { treeDue } from './treeDue'

/** Thursday, October 22, in London: given, never read off the clock. */
const TODAY = '2026-10-22'
const TZ = 'Europe/London'
const due = (dueAt: string | null, over: { status?: 'todo' | 'done'; waiting?: boolean } = {}) =>
  treeDue({ dueAt, status: over.status ?? 'todo', waiting: over.waiting ?? false }, TODAY, TZ)

describe('treeDue', () => {
  it('flags the coming week in amber, by its nearest name', () => {
    expect(due('2026-10-22T17:00:00Z')).toEqual({ text: 'Today', tone: 'soon' })
    expect(due('2026-10-23T17:00:00Z')).toEqual({ text: 'Tomorrow', tone: 'soon' })
    expect(due('2026-10-27T17:00:00Z')).toEqual({ text: 'Tue', tone: 'soon' })
    // The seventh day is still within the week's flag; a weekday would be today's own name.
    expect(due('2026-10-29T17:00:00Z')).toEqual({ text: 'Oct 29', tone: 'soon' })
  })

  it('says a missed deadline in red, and one further off in grey words', () => {
    expect(due('2026-10-15T17:00:00Z')).toEqual({ text: 'Oct 15', tone: 'late' })
    expect(due('2026-11-03T17:00:00Z')).toEqual({ text: 'Nov 3', tone: 'quiet' })
    expect(due('2027-01-08T17:00:00Z')).toEqual({ text: 'Jan 8, 2027', tone: 'quiet' })
  })

  it('reads the day in the account’s zone, not the instant’s', () => {
    // 23:30 UTC on the 22nd is already 00:30 on the 23rd in London.
    expect(due('2026-10-22T23:30:00Z')).toEqual({ text: 'Tomorrow', tone: 'soon' })
  })

  it('keeps a settled task’s deadline quiet, and says Waiting for a held-up open leaf', () => {
    expect(due('2026-10-09T17:00:00Z', { status: 'done' })).toEqual({
      text: 'Oct 9',
      tone: 'quiet',
    })
    expect(due(null, { waiting: true })).toEqual({ text: 'Waiting', tone: 'waiting' })
    expect(due('2026-10-15T17:00:00Z', { status: 'done', waiting: true })).toEqual({
      text: 'Oct 15',
      tone: 'quiet',
    })
    expect(due(null)).toBeNull()
  })
})
