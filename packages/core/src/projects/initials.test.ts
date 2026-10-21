import { describe, expect, it } from 'vitest'
import { initialsOf } from './initials'

describe('initialsOf', () => {
  it('takes the first letter of the first two words, raised', () => {
    expect(initialsOf('Job hunt')).toBe('JH')
    expect(initialsOf('find a lawyer')).toBe('FA')
    expect(initialsOf('rust-analyzer')).toBe('RA')
  })

  it('takes one character from a one-word name, whatever the script', () => {
    expect(initialsOf('Thesis')).toBe('T')
    expect(initialsOf('CTWS')).toBe('C')
    expect(initialsOf('搬家')).toBe('搬')
    expect(initialsOf('  Moving   flat ')).toBe('MF')
  })

  it('gives nothing for nothing', () => {
    expect(initialsOf('   ')).toBe('')
  })
})
