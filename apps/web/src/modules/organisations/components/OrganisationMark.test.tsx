import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { OrganisationMark } from './OrganisationMark'

const said = (name: string, size?: 24 | 40 | 56) =>
  renderToStaticMarkup(<OrganisationMark name={name} {...(size ? { size } : {})} />).replace(
    /<[^>]*>/g,
    '',
  )

describe('an organisation’s mark', () => {
  it('is one letter in a row, and two at a head, a word’s first each', () => {
    expect(said('Harbour Lane')).toBe('H')
    expect(said('Harbour Lane', 40)).toBe('HL')
    expect(said('Harbour Lane', 56)).toBe('HL')
  })

  it('skips what is not a word, and keeps a one-word name to its letter', () => {
    expect(said('Harbour & Lane', 40)).toBe('HL')
    expect(said('stripe', 40)).toBe('S')
    expect(said('字节跳动', 40)).toBe('字')
  })
})
