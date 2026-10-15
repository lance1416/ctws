import { describe, expect, it } from 'vitest'
import { recentEntry } from './item'

describe('a reading item in Recent', () => {
  it('names an untitled link by its fetched title, as every list does', () => {
    const item = { id: 'r1', title: null, fetchedTitle: 'Fetched', url: 'https://example.org/a' }
    expect(recentEntry(item)).toMatchObject({ title: 'Fetched', to: '/reading/r1' })
  })

  it('names a link with nothing fetched by its address, not the whole url', () => {
    const item = { id: 'r2', title: null, fetchedTitle: null, url: 'https://www.example.org/a/b' }
    expect(recentEntry(item).title).toBe('example.org/a/b')
  })
})
