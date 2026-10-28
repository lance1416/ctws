import { describe, expect, it } from 'vitest'
import { readingLabel } from './item'

describe('readingLabel', () => {
  it('prefers the title someone typed', () => {
    expect(readingLabel({ title: '重做配色', url: 'https://example.com' })).toBe('重做配色')
  })

  // The query string is left off: utm tags are noise, and a row has no width to spare.
  it('names an untitled link by host and path, since a host alone says too little', () => {
    expect(readingLabel({ title: null, url: 'https://www.linear.app/now/a/b?c=1' })).toBe(
      'linear.app/now/a/b',
    )
    expect(readingLabel({ title: null, url: 'https://github.com/lance1416/ctws' })).toBe(
      'github.com/lance1416/ctws',
    )
    // The root path is the host itself, with no bare slash.
    expect(readingLabel({ title: null, url: 'https://example.com/' })).toBe('example.com')
  })

  it('shows a url it cannot parse rather than an empty row', () => {
    expect(readingLabel({ title: null, url: 'not a url' })).toBe('not a url')
  })
})
