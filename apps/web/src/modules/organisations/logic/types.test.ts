import { describe, expect, it } from 'vitest'
import { fileLetter, pluralType } from './types'

describe('pluralType', () => {
  it('says a type for several, as the filters do', () => {
    expect(pluralType('Law firm')).toBe('Law firms')
    expect(pluralType('Company')).toBe('Companies')
    expect(pluralType('Charity')).toBe('Charities')
    expect(pluralType('Agency')).toBe('Agencies')
    expect(pluralType('Business')).toBe('Businesses')
    expect(pluralType('Day')).toBe('Days')
  })
})

describe('fileLetter', () => {
  it('files a name under its first letter, and anything else under #', () => {
    expect(fileLetter('harbour & Lane')).toBe('H')
    expect(fileLetter(' Stripe')).toBe('S')
    expect(fileLetter('腾讯')).toBe('#')
    expect(fileLetter('3M')).toBe('#')
  })
})
