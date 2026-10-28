import { describe, expect, it } from 'vitest'
import { cityAndCountry } from './places'

describe('cityAndCountry', () => {
  it('leaves the region out', () => {
    expect(cityAndCountry('London, England, United Kingdom')).toBe('London, United Kingdom')
    expect(cityAndCountry('Shenzhen, Guangdong, China')).toBe('Shenzhen, China')
  })

  it('keeps a place written with less, or typed by hand', () => {
    expect(cityAndCountry('Shenzhenwan, China')).toBe('Shenzhenwan, China')
    expect(cityAndCountry('Toronto')).toBe('Toronto')
  })
})
