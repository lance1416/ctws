import { describe, expect, it } from 'vitest'
import { agoWords, stillOffered, type Away } from './away'

const OPENED = Date.parse('2026-10-18T10:12:00Z')
const away: Away = {
  url: 'https://docs.google.com/document/d/prep',
  name: 'System design prep',
  from: { type: 'task', id: 't1', title: 'Prepare the system design round', projectId: 'p1' },
  at: OPENED,
}
const after = (ms: number) => new Date(OPENED + ms)
const MIN = 60_000

describe('a resource opened from CTWS', () => {
  it('is offered back for a day, and no longer', () => {
    expect(stillOffered(away, after(0))).toBe(true)
    // A page's clock read a little before the click still offers it.
    expect(stillOffered(away, after(-30_000))).toBe(true)
    expect(stillOffered(away, after(24 * 60 * MIN - 1))).toBe(true)
    expect(stillOffered(away, after(24 * 60 * MIN))).toBe(false)
  })

  it('says how long ago it was opened', () => {
    expect(agoWords(away, after(30_000))).toBe('Just now')
    expect(agoWords(away, after(-30_000))).toBe('Just now')
    expect(agoWords(away, after(12 * MIN))).toBe('12 min ago')
    expect(agoWords(away, after(185 * MIN))).toBe('3 h ago')
  })
})
