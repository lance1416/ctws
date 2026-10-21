import { describe, expect, it } from 'vitest'
import { initialsOf } from './initials'

describe('initialsOf', () => {
  it("takes the first letters of the first two words, skipping the little ones (FR-052's examples)", () => {
    expect(initialsOf('Job hunt')).toBe('JH')
    expect(initialsOf('Find a lawyer')).toBe('FL')
    expect(initialsOf('rust-analyzer')).toBe('RA')
    expect(initialsOf('  Moving   flat ')).toBe('MF')
  })

  it('takes the first two letters of a one-word name', () => {
    expect(initialsOf('CTWS')).toBe('CT')
    expect(initialsOf('Thesis')).toBe('TH')
    expect(initialsOf('Atlas')).toBe('AT')
    expect(initialsOf('the Atlas')).toBe('AT')
  })

  it('takes the first Han character of a name that starts with one', () => {
    expect(initialsOf('搬家')).toBe('搬')
    expect(initialsOf('搬家 2026')).toBe('搬')
  })

  it('keeps the little words when the name is nothing else, and one letter when that is all', () => {
    expect(initialsOf('The End')).toBe('EN')
    expect(initialsOf('of the')).toBe('OT')
    expect(initialsOf('x')).toBe('X')
  })

  it('gives nothing for nothing', () => {
    expect(initialsOf('   ')).toBe('')
  })
})
