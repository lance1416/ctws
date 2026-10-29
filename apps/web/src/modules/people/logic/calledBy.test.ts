import { describe, expect, it } from 'vitest'
import { calledBy } from './calledBy'

describe('what a page calls a person', () => {
  it('says the given name of a name in letters', () => {
    expect(calledBy({ name: 'Mira Chen', givenName: 'Mira' })).toBe('Mira')
  })

  it('says a Chinese name whole (P4-07)', () => {
    expect(calledBy({ name: '王磊', givenName: '磊' })).toBe('王磊')
  })
})
