import { describe, expect, it } from 'vitest'
import { displayName, sortKey, splitName } from './names'

describe('splitName', () => {
  it.each([
    [
      '欧阳娜娜',
      { givenName: '娜娜', middleName: null, familyName: '欧阳', why: 'Compound surname' },
    ],
    ['李雯', { givenName: '雯', middleName: null, familyName: '李', why: null }],
    ['王 磊', { givenName: '磊', middleName: null, familyName: '王', why: 'Had a space' }],
    [
      'Mary Jane Watson',
      { givenName: 'Mary', middleName: 'Jane', familyName: 'Watson', why: 'Several words' },
    ],
    ['Mira Chen', { givenName: 'Mira', middleName: null, familyName: 'Chen', why: null }],
    ['Cher', { givenName: 'Cher', middleName: null, familyName: null, why: 'One word' }],
    ['Li, Wendy', { givenName: 'Wendy', middleName: null, familyName: 'Li', why: 'Had a comma' }],
    [
      'Watson, Mary Jane',
      { givenName: 'Mary', middleName: 'Jane', familyName: 'Watson', why: 'Had a comma' },
    ],
    ['雯', { givenName: '雯', middleName: null, familyName: null, why: 'One word' }],
  ])('%s', (text, expected) => {
    expect(splitName(text)).toEqual(expected)
  })

  it('does not take a compound surname as the whole name', () => {
    // Two characters that happen to be a compound surname, with nothing after them.
    expect(splitName('欧阳')).toEqual({
      givenName: '阳',
      middleName: null,
      familyName: '欧',
      why: null,
    })
  })
})

describe('displayName', () => {
  it('puts a Chinese family name first with no space, and a Latin one last', () => {
    expect(displayName({ givenName: '雯', middleName: null, familyName: '李' })).toBe('李雯')
    expect(displayName({ givenName: 'Wendy', middleName: null, familyName: 'Li' })).toBe('Wendy Li')
    expect(displayName({ givenName: 'Mary', middleName: 'Jane', familyName: 'Watson' })).toBe(
      'Mary Jane Watson',
    )
    expect(displayName({ givenName: 'Cher', middleName: null, familyName: null })).toBe('Cher')
  })
})

describe('sortKey', () => {
  it('files by the family name, Chinese by pinyin, beside its Latin neighbours', () => {
    expect(sortKey({ givenName: '思远', middleName: null, familyName: '陈' })).toBe('C')
    expect(sortKey({ givenName: 'Mira', middleName: null, familyName: 'Chen' })).toBe('C')
    expect(sortKey({ givenName: '雯', middleName: null, familyName: '李' })).toBe('L')
    expect(sortKey({ givenName: 'Wendy', middleName: null, familyName: 'Li' })).toBe('L')
    expect(sortKey({ givenName: '娜娜', middleName: null, familyName: '欧阳' })).toBe('O')
  })

  it('reads a surname the way surnames are read', () => {
    // 曾 is zēng as a surname, céng as a word; 单 is shàn, not dān.
    expect(sortKey({ givenName: '国藩', middleName: null, familyName: '曾' })).toBe('Z')
    expect(sortKey({ givenName: '雄信', middleName: null, familyName: '单' })).toBe('S')
  })

  it('uses the given name when there is no family name, drops accents, and files the rest under #', () => {
    expect(sortKey({ givenName: 'Cher', middleName: null, familyName: null })).toBe('C')
    expect(sortKey({ givenName: 'Élodie', middleName: null, familyName: 'Égalité' })).toBe('E')
    expect(sortKey({ givenName: 'Ωmega', middleName: null, familyName: null })).toBe('#')
  })
})
