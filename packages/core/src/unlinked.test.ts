import { describe, expect, it } from 'vitest'
import { findable, linkUnlinked, unlinkedIn } from './unlinked'

const LENA = { type: 'person' as const, id: '01a1a42a-0000-7000-8000-000000000001' }
const at = (text: string, names: string[]) =>
  unlinkedIn(text, names, LENA).map((u) => u.excerpt.slice(u.start, u.end))

describe('unlinkedIn', () => {
  it('finds a name in a sentence that does not mention its thing, whatever the case', () => {
    expect(
      unlinkedIn('Lunch with Lena Fischer next week. Then home.', ['Lena Fischer'], LENA),
    ).toEqual([{ excerpt: 'Lunch with Lena Fischer next week.', start: 11, end: 23 }])
    expect(at('lunch with lena fischer', ['Lena Fischer'])).toEqual(['lena fischer'])
  })

  it('takes a Latin name only as a whole word', () => {
    expect(at('The Atlases are here; Atlas is not.', ['Atlas'])).toEqual(['Atlas'])
  })

  it('takes a Chinese name as written, even inside a longer run of characters', () => {
    expect(at('王明天来。', ['王明'])).toEqual(['王明'])
  })

  it('leaves a sentence that mentions the thing already, and a name inside any link', () => {
    const mention = `[@Lena](ctws://person/${LENA.id})`
    expect(at(`Lena and ${mention} met.`, ['Lena'])).toEqual([])
    expect(at('See [Lena notes](https://example.com) here', ['Lena'])).toEqual([])
  })

  it('lets the longest name that fits win, once a place', () => {
    expect(at('Met Lena Fischer and Lena', ['Lena', 'Lena Fischer'])).toEqual([
      'Lena Fischer',
      'Lena',
    ])
  })

  it('does not look for names too short to tell apart', () => {
    expect(findable('Al')).toBe(false)
    expect(findable('Ann')).toBe(true)
    expect(findable('王')).toBe(false)
    expect(findable('王明')).toBe(true)
    expect(at('Al went home', ['Al'])).toEqual([])
  })
})

describe('linkUnlinked', () => {
  it('turns the name into a mention, as it was written', () => {
    const text = 'Lunch with Lena Fischer next week. Then home.'
    const [u] = unlinkedIn(text, ['Lena Fischer'], LENA)
    expect(linkUnlinked(text, u!, LENA)).toBe(
      `Lunch with [@Lena Fischer](ctws://person/${LENA.id}) next week. Then home.`,
    )
  })

  it('refuses when the sentence has changed since it was read', () => {
    const [u] = unlinkedIn('Lunch with Lena Fischer next week.', ['Lena Fischer'], LENA)
    expect(linkUnlinked('Dinner with Lena Fischer next week.', u!, LENA)).toBeNull()
  })
})
