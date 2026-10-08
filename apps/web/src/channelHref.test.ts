import { describe, expect, it } from 'vitest'
import { channelHref } from './api/contacts'

/**
 * An address in a contact list is a LINK. Getting the scheme wrong means the person copies the
 * address by hand, which is the whole cost the list existed to remove.
 */
describe('channelHref', () => {
  it('opens an email in the mail client', () => {
    expect(channelHref('email', 'a@b.test')).toBe('mailto:a@b.test')
  })

  it('strips the spacing a person writes a phone number with', () => {
    // A dialler takes digits; 「+86 138 0000 0000」 is how a human writes it.
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
