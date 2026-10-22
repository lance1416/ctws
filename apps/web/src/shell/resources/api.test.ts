import { describe, expect, it } from 'vitest'
import { followable } from './api'

describe('followable', () => {
  it('follows an http(s) address and nothing else', () => {
    expect(followable('https://docs.google.com/document/d/a')).toBe(
      'https://docs.google.com/document/d/a',
    )
    expect(followable('http://example.com')).toBe('http://example.com')
    expect(followable('javascript:alert(1)')).toBeUndefined()
    expect(followable('data:text/html,hi')).toBeUndefined()
    expect(followable('')).toBeUndefined()
  })
})
