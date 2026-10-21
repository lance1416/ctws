import { describe, expect, it } from 'vitest'
import type { Creator } from '../contract'
import { menuOrder } from './recent'

const c = (kind: Creator['kind'], key: string, label: string): Creator => ({ kind, key, label })
const ALL = [
  c('task', 't', 'Task'),
  c('meeting', 'm', 'Meeting'),
  c('person', 'p', 'Person'),
  c('organisation', 'o', 'Organisation'),
  c('communication', 'x', 'Communication'),
  c('reading', 'r', 'Reading'),
  c('note', 'n', 'Note'),
]

describe('the New menu (FR-026)', () => {
  it('offers only what can belong to a project: no person, no organisation', () => {
    const { shown, hidden } = menuOrder(ALL, ['person', 'organisation'], '')
    expect([...shown, ...hidden].map((x) => x.kind)).toEqual([
      'task',
      'meeting',
      'communication',
      'reading',
      'note',
    ])
    expect(menuOrder(ALL, [], 'pe').shown).toEqual([])
  })

  it('shows the kinds used lately first, then the rest in order, and only a few', () => {
    const { shown, hidden } = menuOrder(ALL, ['communication', 'meeting'], '')
    expect(shown.map((x) => x.kind)).toEqual(['communication', 'meeting', 'task', 'reading'])
    expect(hidden.map((x) => x.kind)).toEqual(['note'])
  })

  it('keeps the fixed order when nothing was used yet', () => {
    expect(menuOrder(ALL, [], '').shown.map((x) => x.kind)).toEqual([
      'task',
      'meeting',
      'communication',
      'reading',
    ])
  })

  it('finds the rest by the start of their name: "me" leaves Meeting alone', () => {
    expect(menuOrder(ALL, [], 'me').shown.map((x) => x.label)).toEqual(['Meeting'])
    expect(menuOrder(ALL, [], 'zz').shown).toEqual([])
  })
})
