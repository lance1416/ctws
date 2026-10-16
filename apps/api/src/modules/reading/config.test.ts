import { describe, expect, it } from 'vitest'
import { readingConfig } from './config'

describe('reading settings', () => {
  it('fetches a pasted link’s title unless turned off', () => {
    expect(readingConfig({}).unfurl).toBe(true)
    expect(readingConfig({ READING_UNFURL: 'true' }).unfurl).toBe(true)
    expect(readingConfig({ READING_UNFURL: 'false' }).unfurl).toBe(false)
  })

  it('refuses a value that is neither on nor off', () => {
    expect(() => readingConfig({ READING_UNFURL: 'yes' })).toThrow()
  })
})
