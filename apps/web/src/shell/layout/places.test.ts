import { describe, expect, it } from 'vitest'
import { PAGES_BEFORE_THE_LINE, PLACES, placeOf } from './places'

describe('the icon bar', () => {
  it('has the eleven entries in FR-019 order, the four pages first', () => {
    expect(PLACES.map((p) => p.label)).toEqual([
      'Workbench',
      'Today',
      'Calendar',
      'Review',
      'Projects',
      'People',
      'Organisations',
      'Meetings',
      'Communication',
      'Reading',
      'Notes',
    ])
    expect(PLACES.slice(0, PAGES_BEFORE_THE_LINE).every((p) => p.kind === null)).toBe(true)
    expect(PLACES.slice(PAGES_BEFORE_THE_LINE).every((p) => p.kind !== null)).toBe(true)
  })

  it('gives every entry its own key and its own root (FR-029)', () => {
    expect(new Set(PLACES.map((p) => p.key)).size).toBe(PLACES.length)
    expect(new Set(PLACES.map((p) => p.to)).size).toBe(PLACES.length)
    expect(PLACES.find((p) => p.label === 'People')?.key).toBe('e')
    expect(PLACES.find((p) => p.label === 'Review')?.key).toBe('v')
  })

  it('knows which place a path is in', () => {
    expect(placeOf('/')?.id).toBe('workbench')
    expect(placeOf('/people/abc')?.id).toBe('people')
    expect(placeOf('/projects')?.id).toBe('projects')
    // The Workbench is the root only: a task's own address is in no place.
    expect(placeOf('/tasks/abc')).toBeNull()
  })
})
