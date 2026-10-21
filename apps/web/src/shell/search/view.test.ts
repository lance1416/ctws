import { describe, expect, it } from 'vitest'
import { grouped, kindsWithHits, nextTab, scopesMatching, type Tab } from './view'

const hit = (type: 'task' | 'person' | 'meeting', id: string) => ({ type, id })
const hits = [
  ...Array.from({ length: 7 }, (_, i) => hit('task', `t${i}`)),
  hit('person', 'p1'),
  hit('meeting', 'm1'),
  hit('meeting', 'm2'),
]

describe('the search view (FR-024)', () => {
  it('lists the kinds that have hits, in the fixed order, with their counts', () => {
    expect(kindsWithHits(hits)).toEqual([
      { type: 'task', n: 7 },
      { type: 'person', n: 1 },
      { type: 'meeting', n: 2 },
    ])
  })

  it('shows at most five of a kind under All, and every one under the kind', () => {
    const all = grouped(hits, 'all')
    expect(all.map((g) => [g.type, g.rows.length, g.more])).toEqual([
      ['task', 5, 2],
      ['person', 1, 0],
      ['meeting', 2, 0],
    ])
    expect(grouped(hits, 'task').map((g) => [g.type, g.rows.length, g.more])).toEqual([
      ['task', 7, 0],
    ])
  })

  it('cycles the tabs with Tab, wrapping back to All, and the other way with Shift+Tab', () => {
    const tabs: Tab[] = ['all', 'task', 'person']
    expect(nextTab(tabs, 'all')).toBe('task')
    expect(nextTab(tabs, 'person')).toBe('all')
    expect(nextTab(tabs, 'all', true)).toBe('person')
    expect(nextTab([], 'all')).toBe('all')
  })

  it('offers the kinds a slash can scope to, narrowed by what follows it', () => {
    expect(scopesMatching('')).toHaveLength(8)
    expect(scopesMatching('mee')).toEqual(['meeting'])
    expect(scopesMatching('p')).toEqual(['person', 'project'])
    expect(scopesMatching('zz')).toEqual([])
  })
})
