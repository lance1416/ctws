import { describe, expect, it } from 'vitest'
import {
  callingCodeFor,
  displayPhone,
  formatPhone,
  phoneProblem,
  regionFromLocale,
  retype,
  toE164,
} from './phoneNumbers'

describe('formatPhone', () => {
  it('lays out a number with a country code in international form', () => {
    expect(formatPhone('+8613900001234')).toBe('+86 139 0000 1234')
    expect(formatPhone('+442079460958')).toBe('+44 20 7946 0958')
  })

  it('groups a number without a country code the local way', () => {
    expect(formatPhone('13900001234', 'CN')).toBe('139 0000 1234')
    expect(formatPhone('02079460958', 'GB')).toBe('020 7946 0958')
  })

  it('lays out a partial number as far as it is typed, without jumping back', () => {
    expect(formatPhone('139000', 'CN')).toBe('139 000')
    expect(formatPhone('+8613', 'CN')).toBe('+86 13')
  })

  it('leaves what it cannot lay out as written', () => {
    expect(formatPhone('分机 8012')).toBe('分机 8012')
    expect(formatPhone('')).toBe('')
  })
})

describe('regionFromLocale', () => {
  it('takes the region from a language tag', () => {
    expect(regionFromLocale('zh-CN')).toBe('CN')
    expect(regionFromLocale('en-GB')).toBe('GB')
  })

  it('gives no region when the tag has none, rather than guessing', () => {
    expect(regionFromLocale('zh')).toBeUndefined()
    expect(regionFromLocale('')).toBeUndefined()
  })
})

describe('displayPhone', () => {
  it('lays out E.164 in readable international form', () => {
    expect(displayPhone('+8613800000000')).toBe('+86 138 0000 0000')
    expect(displayPhone('+442079460958')).toBe('+44 20 7946 0958')
    expect(displayPhone('+17301974443')).toBe('+1 730 197 4443')
  })

  it('shows what it cannot lay out as stored, so old data does not vanish', () => {
    expect(displayPhone('(730) 197-4443')).toBe('(730) 197-4443')
    expect(displayPhone('分机 8012')).toBe('分机 8012')
    expect(displayPhone('')).toBe('')
  })
})

describe('toE164', () => {
  it('stores a typed number as one international number', () => {
    expect(toE164('+86 138 0000 0000')).toBe('+8613800000000')
    expect(toE164('+44 (0)20 7946 0958')).toBe('+442079460958')
  })

  it('adds the local country code to an old number without one, so it can pass validation', () => {
    expect(toE164('(730) 197-4443', 'US')).toBe('+17301974443')
    expect(toE164('139 0000 1234', 'CN')).toBe('+8613900001234')
  })

  it('keeps what it cannot complete as written', () => {
    expect(toE164('分机 8012')).toBe('分机 8012')
    expect(toE164('139 0000 1234')).toBe('139 0000 1234')
  })
})

describe('retype', () => {
  it('lets a deleted space stay deleted instead of putting it straight back', () => {
    expect(retype('+86 139 0000 1234', '+86 1390000 1234')).toBe('+86 1390000 1234')
  })

  it('lays out the whole number again after another digit', () => {
    expect(retype('+8613', '+86139')).toBe('+86 139')
  })
})

describe('phoneProblem', () => {
  it('says when a length is not one the country uses', () => {
    expect(phoneProblem('+8613800')).toBe('+86 numbers are not that length')
    // Within E.164's 15 digits, so the contract allows it; China has no number this long.
    expect(phoneProblem('+86 138 0000 0000 00')).toBe('+86 numbers are not that length')
  })

  it('stays quiet for a valid number and for one still being typed', () => {
    expect(phoneProblem('+86 138 0000 0000')).toBeNull()
    expect(phoneProblem('+86 1380000')).toBeNull()
    expect(phoneProblem('')).toBeNull()
  })

  it('leaves a missing country code to the contract, so one problem is said once', () => {
    expect(phoneProblem('010-1234-5678')).toBeNull()
  })
})

describe('callingCodeFor', () => {
  it("gives a region's calling code", () => {
    expect(callingCodeFor('CN')).toBe('+86')
    expect(callingCodeFor('GB')).toBe('+44')
  })

  it('does not guess for an unknown region', () => {
    expect(callingCodeFor(undefined)).toBeUndefined()
    expect(callingCodeFor('ZZ')).toBeUndefined()
  })
})
