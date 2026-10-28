import { describe, expect, it } from 'vitest'
import { deleteQuestion } from './deleteQuestion'

describe('deleteQuestion', () => {
  it('counts what a series has already held', () => {
    expect(deleteQuestion({ title: 'Atlas weekly', repeats: true, held: 10, hasNotes: true })).toBe(
      'Delete Atlas weekly? The series goes, with the 10 meetings already held. Their notes stay, as notes on their own.',
    )
    expect(deleteQuestion({ title: 'Atlas weekly', repeats: true, held: 1, hasNotes: false })).toBe(
      'Delete Atlas weekly? The series goes, with the 1 meeting already held. Their notes stay, as notes on their own.',
    )
  })

  it('says only that a series held never yet goes', () => {
    expect(deleteQuestion({ title: 'Atlas weekly', repeats: true, held: 0, hasNotes: false })).toBe(
      'Delete Atlas weekly? The series goes.',
    )
  })

  it('names a one-off’s notes only when it has some', () => {
    expect(
      deleteQuestion({ title: 'Design review', repeats: false, held: 1, hasNotes: true }),
    ).toBe('Delete Design review? The meeting goes. Its notes stay, as notes on their own.')
    expect(
      deleteQuestion({ title: 'Design review', repeats: false, held: 0, hasNotes: false }),
    ).toBe('Delete Design review? The meeting goes.')
  })
})
