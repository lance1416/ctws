import { describe, expect, it } from 'vitest'
import {
  checkLinkUrl,
  isPublicAddress,
  literalAddress,
} from '../../../src/modules/reading/unfurl/safe-url'

/**
 * Which addresses an outbound fetch may reach. The address is any string someone pasted, so a
 * link to 169.254.169.254 would read cloud metadata and one to 10.x would probe the internal
 * network; every range is pinned here.
 */

describe('isPublicAddress', () => {
  it('refuses loopback, private, link-local and cloud metadata addresses', () => {
    for (const ip of [
      '127.0.0.1',
      '127.9.9.9',
      '0.0.0.0',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '198.18.0.1',
      '224.0.0.1',
      '255.255.255.255',
    ]) {
      expect(isPublicAddress(ip, 4), ip).toBe(false)
    }
  })

  it('allows public addresses', () => {
    for (const ip of ['1.1.1.1', '8.8.8.8', '140.82.121.4', '172.32.0.1', '192.167.1.1']) {
      expect(isPublicAddress(ip, 4), ip).toBe(true)
    }
  })

  it('refuses IPv6 loopback, ULA and link-local, and IPv4 wrapped in IPv6', () => {
    for (const ip of [
      '::1',
      '::',
      'fc00::1',
      'fd12:3456::1',
      'fe80::1',
      'ff02::1',
      '::ffff:127.0.0.1',
      '::ffff:10.0.0.1',
      '64:ff9b::7f00:1',
      '2002:7f00:0001::1',
    ]) {
      expect(isPublicAddress(ip, 6), ip).toBe(false)
    }
    expect(isPublicAddress('2606:4700:4700::1111', 6)).toBe(true)
  })
})

describe('checkLinkUrl', () => {
  it('accepts only http and https', () => {
    expect(checkLinkUrl('file:///etc/passwd')).toBeNull()
    expect(checkLinkUrl('gopher://a.test/1')).toBeNull()
    expect(checkLinkUrl('javascript:alert(1)')).toBeNull()
    expect(checkLinkUrl('不是地址')).toBeNull()
  })

  it('allows any port; reachability is decided by address', () => {
    expect(checkLinkUrl('https://a.test:8443/x')?.port).toBe('8443')
  })

  it('refuses a URL with credentials', () => {
    expect(checkLinkUrl('http://user:pw@a.test/')).toBeNull()
  })

  it('accepts an ordinary URL', () => {
    expect(checkLinkUrl('https://github.com/lance1416/ctws')?.host).toBe('github.com')
  })
})

/** A numeric host skips DNS and the lookup guard, so it must be recognised and checked directly. */
describe('literalAddress', () => {
  it('recognises a numeric host, bracketed IPv6 included', () => {
    expect(literalAddress('169.254.169.254')).toEqual({ ip: '169.254.169.254', family: 4 })
    expect(literalAddress('[::1]')).toEqual({ ip: '::1', family: 6 })
  })

  it('does not treat a domain name as an address', () => {
    expect(literalAddress('github.com')).toBeNull()
    expect(literalAddress('1.1.1.1.example.com')).toBeNull()
  })
})
