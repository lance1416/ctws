import { describe, expect, it } from 'vitest'
import { outlineOf, sectionInSight } from './outline'

describe('a note’s outline', () => {
  it('lists its headings in order, `###` under the sections, their marks gone', () => {
    const text = 'Intro\n\n## Before the **round**\n\n### Chance a retry collides\n\n# Numbers'
    expect(outlineOf(text).map((h) => [h.words, h.depth])).toEqual([
      ['Before the round', 1],
      ['Chance a retry collides', 2],
      ['Numbers', 1],
    ])
  })

  it('leaves out what is inside a code fence, and a `#` with no words', () => {
    const text = '```sh\n# a comment\n```\n#\n#nospace\n## Real'
    expect(outlineOf(text).map((h) => h.words)).toEqual(['Real'])
  })

  it('knows where each starts, for the jump', () => {
    const text = 'ab\n## Two'
    expect(outlineOf(text)[0]!.offset).toBe(3)
  })

  it('marks the section in sight: the first heading at or below the top, else the last', () => {
    const headings = outlineOf('top\n## A\nmid\n## B\nend')
    expect(sectionInSight(headings, 0)?.words).toBe('A')
    expect(sectionInSight(headings, 'top\n## A\nmi'.length)?.words).toBe('B')
    expect(sectionInSight(headings, 'top\n## A\nmid\n## B\ne'.length)?.words).toBe('B')
    expect(sectionInSight([], 0)).toBeNull()
  })
})
