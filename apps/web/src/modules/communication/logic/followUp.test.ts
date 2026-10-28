import { describe, expect, it } from 'vitest'
import {
  dueLine,
  followUpChip,
  followUpLine,
  followUpTone,
  nextMonday,
  nextWords,
} from './followUp'

// Thursday 22 October 2026.
const TODAY = '2026-10-22'

describe('a follow-up day', () => {
  it('is late once passed, soon today and tomorrow, later after (FR-071)', () => {
    expect(followUpTone('2026-10-21', TODAY)).toBe('late')
    expect(followUpTone(TODAY, TODAY)).toBe('soon')
    expect(followUpTone('2026-10-23', TODAY)).toBe('soon')
    expect(followUpTone('2026-10-26', TODAY)).toBe('later')
  })

  it('is said on the chip, in the sidebar and on Today as artboards 12 and 15 have it', () => {
    expect(followUpChip('2026-10-21', TODAY)).toBe('Oct 21')
    expect(followUpChip('2026-10-23', TODAY)).toBe('Tomorrow')
    expect(followUpChip('2026-10-26', TODAY)).toBe('Mon, Oct 26')
    expect(followUpLine('2026-10-21', TODAY)).toBe('Follow up was Oct 21')
    expect(followUpLine('2026-10-23', TODAY)).toBe('Follow up tomorrow')
    expect(followUpLine('2026-10-26', TODAY)).toBe('Follow up Oct 26')
    expect(dueLine('2026-10-21', TODAY)).toBe('Due yesterday')
    expect(dueLine(TODAY, TODAY)).toBe('Due today')
    expect(dueLine('2026-10-19', TODAY)).toBe('Due Oct 19')
  })

  it('moves to the next Monday, a week on when today is one', () => {
    expect(nextMonday(TODAY)).toBe('2026-10-26')
    expect(nextMonday('2026-10-26')).toBe('2026-11-02')
    expect(nextMonday('2026-10-25')).toBe('2026-10-26')
  })
})

describe('what is next with an organisation', () => {
  it('reads as the Next column has it (FR-071)', () => {
    expect(nextWords({ kind: 'follow-up', on: '2026-10-26', late: false }, TODAY)).toEqual({
      text: 'Follow up Oct 26',
      tone: 'later',
    })
    expect(nextWords({ kind: 'follow-up', on: '2026-10-20', late: true }, TODAY)).toEqual({
      text: 'Follow up late',
      tone: 'late',
    })
    expect(nextWords({ kind: 'no-reply', days: 9 }, TODAY)).toEqual({
      text: 'No reply, 9 days',
      tone: 'soon',
    })
    expect(nextWords({ kind: 'nothing' }, TODAY)).toEqual({ text: 'Nothing', tone: 'later' })
  })
})
