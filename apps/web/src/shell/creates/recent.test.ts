import { describe, expect, it } from 'vitest'
import type { Creator } from '../contract'
import { menuOrder } from './recent'

const c = (kind: Creator['kind'], key: string, label: string): Creator => ({ kind, key, label })
const ALL = [
  c('task', 't', 'Task'),
  c('meeting', 'm', 'Meeting'),
  c('person', 'p', 'Person'),
  c('organisation', 'o', 'Organisation'),
  c('communication', 'x', 'Message'),
  c('reading', 'r', 'Reading'),
  c('note', 'n', 'Note'),
]

describe('the New menu (FR-026)', () => {
  it('shows the kinds used lately first, then the rest in order, and only a few', () => {
    const { shown, hidden } = menuOrder(ALL, ['communication', 'meeting'], '')
    expect(shown.map((x) => x.kind)).toEqual(['communication', 'meeting', 'task', 'person'])
    expect(hidden.map((x) => x.kind)).toEqual(['organisation', 'reading', 'note'])
  })

  it('keeps the fixed order when nothing was used yet', () => {
    expect(menuOrder(ALL, [], '').shown.map((x) => x.kind)).toEqual([
      'task',
      'meeting',
      'person',
      'organisation',
    ])
  })

  it('finds the rest by typing', () => {
    expect(menuOrder(ALL, [], 'me').shown.map((x) => x.label)).toEqual(['Meeting', 'Message'])
    expect(menuOrder(ALL, [], 'zz').shown).toEqual([])
  })
})
