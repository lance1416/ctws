import { describe, expect, it } from 'vitest'
import { fileNameOf } from './download'

describe('a downloaded note’s file name', () => {
  it('is what the note is called, then .md', () => {
    expect(fileNameOf('System design prep')).toBe('System design prep.md')
    expect(fileNameOf('面试准备')).toBe('面试准备.md')
  })

  it('leaves out what a file system forbids, and never starts with a dot', () => {
    expect(fileNameOf('Q3: plan / risks?')).toBe('Q3 plan risks.md')
    expect(fileNameOf('..hidden')).toBe('hidden.md')
  })

  it('is Note when nothing of the name is left', () => {
    expect(fileNameOf('///')).toBe('Note.md')
  })
})
