import { describe, expect, it } from 'vitest'
import { byKind, channelHref, channelLabel, channelPlaceholder } from './channels'

describe('byKind', () => {
  const ch = (kind: 'email' | 'phone' | 'url', value: string) => ({ kind, value, label: null })

  it('groups email, then phone, then link', () => {
    const mixed = [
      ch('email', 'a@x.test'),
      ch('url', 'x.test/a'),
      ch('email', 'b@x.test'),
      ch('phone', '+86 139 0000 1234'),
      ch('url', 'x.test/b'),
    ]
    expect(byKind(mixed).map((c) => c.kind)).toEqual(['email', 'email', 'phone', 'url', 'url'])
  })

  it('keeps the written order within a kind', () => {
    const two = [ch('email', '第二个'), ch('email', '第一个')]
    expect(byKind(two).map((c) => c.value)).toEqual(['第二个', '第一个'])
  })
})

describe('channelLabel', () => {
  it('writes a link as its host and path, since a whole address does not read on one line', () => {
    expect(channelLabel('url', 'https://sites.google.com/site/a/b?utm=1')).toBe(
      'sites.google.com/site/a/b',
    )
  })

  it('writes an email or a phone as it is', () => {
    expect(channelLabel('email', 'ying@acme.test')).toBe('ying@acme.test')
    expect(channelLabel('phone', '+86 139 0000 1234')).toBe('+86 139 0000 1234')
  })
})

describe('channelPlaceholder', () => {
  it('shows what each kind looks like rather than a fill-in note', () => {
    expect(channelPlaceholder('email')).toContain('@')
    expect(channelPlaceholder('phone')).toMatch(/\d/)
    expect(channelPlaceholder('url')).toContain('.')
  })
})

describe('channelHref', () => {
  it('opens an email in the mail client', () => {
    expect(channelHref('email', 'a@b.test')).toBe('mailto:a@b.test')
  })

  it('strips the spacing a person writes a phone number with', () => {
    // A dialler takes digits; "+86 138 0000 0000" is how a human writes it.
    expect(channelHref('phone', '+86 138 0000 0000')).toBe('tel:+8613800000000')
    expect(channelHref('phone', '010-1234-5678')).toBe('tel:01012345678')
  })

  it('gives a bare host a scheme, so it is not read as a relative path', () => {
    // Without this, `github.com/dana` links inside the app and goes nowhere.
    expect(channelHref('url', 'github.com/dana')).toBe('https://github.com/dana')
    expect(channelHref('url', 'https://github.com/dana')).toBe('https://github.com/dana')
    expect(channelHref('url', 'HTTP://example.test')).toBe('HTTP://example.test')
  })

  it('has no opinion about a kind it does not know', () => {
    expect(channelHref('fax', '123')).toBeNull()
  })
})
