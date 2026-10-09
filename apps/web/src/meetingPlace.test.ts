import { describe, expect, it } from 'vitest'
import { meetingLink } from './meetingPlace'

describe('meetingLink', () => {
  it('opens an explicit http(s) location', () => {
    expect(meetingLink('https://meet.example.test/abc-defg')).toBe(
      'https://meet.example.test/abc-defg',
    )
    expect(meetingLink('  http://zoom.example.test/j/123  ')).toBe('http://zoom.example.test/j/123')
  })

  it('leaves a place alone, even one that looks like a domain', () => {
    // A room is not a link, and guessing one would send a person to a site that may exist and
    // may not be anybody's.
    expect(meetingLink('Acme HQ, 3F')).toBeNull()
    expect(meetingLink('acme.com office')).toBeNull()
    expect(meetingLink('meet.google.com/abc')).toBeNull()
    expect(meetingLink('')).toBeNull()
    expect(meetingLink(null)).toBeNull()
  })

  it('refuses a scheme that is not the web', () => {
    // `javascript:` in an href is the oldest injection there is, and this value is free text.
    expect(meetingLink('javascript:alert(1)')).toBeNull()
    expect(meetingLink('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(meetingLink('file:///etc/passwd')).toBeNull()
  })

  it('refuses a link with a space in it, which is a sentence that starts with one', () => {
    expect(meetingLink('https://meet.example.test/abc and then lunch')).toBeNull()
  })
})
