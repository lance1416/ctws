import { describe, expect, it } from 'vitest'
import { createPersonBody } from './person'

describe('a channel is checked by its kind', () => {
  const parse = (kind: string, value: string) =>
    createPersonBody.safeParse({ name: 'Ying', channels: [{ kind, value }] })
  const ok = (kind: string, value: string) => parse(kind, value).success
  const says = (kind: string, value: string) => parse(kind, value).error?.issues[0]?.message

  it('takes an email that looks like one', () => {
    expect(ok('email', 'ying@acme.test')).toBe(true)
    expect(ok('email', 'ying+jobs@acme.co.uk')).toBe(true)
    expect(ok('email', 'to fill in')).toBe(false)
    expect(ok('email', 'ying@acme')).toBe(false)
    expect(ok('email', 'ying at acme.test')).toBe(false)
  })

  it('takes a phone number only with its country code', () => {
    expect(ok('phone', '+86 139 0000 1234')).toBe(true)
    expect(ok('phone', '+442079460958')).toBe(true)
    expect(ok('phone', '+1 (730) 197-4443')).toBe(true)
    expect(ok('phone', '010-1234-5678')).toBe(false)
    expect(ok('phone', '(020) 7946 0958')).toBe(false)
    expect(ok('phone', 'to fill in')).toBe(false)
  })

  it('names the rule that is missing', () => {
    expect(says('phone', '010-1234-5678')).toBe('start with the country code, like +86')
    expect(says('phone', '+86 139 abc')).toBe(
      'a phone number is digits, spaces, dashes and brackets',
    )
    expect(says('phone', '+123')).toBe('that is too short for a phone number')
    expect(says('phone', '+1234567890123456')).toBe('a phone number has at most 15 digits')
    expect(says('phone', 'to fill in')).toBe(
      'a phone number is digits, spaces, dashes and brackets',
    )
  })

  it('takes a link with a host that has a dot, scheme optional', () => {
    expect(ok('url', 'https://sites.google.com/site/a')).toBe(true)
    expect(ok('url', 'github.com/lance1416')).toBe(true)
    expect(ok('url', 'to fill in')).toBe(false)
    expect(ok('url', 'localhost')).toBe(false)
  })
})
