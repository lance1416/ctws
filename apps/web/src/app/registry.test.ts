import { OBJECT_TYPES } from '@ctws/contracts'
import { describe, expect, it } from 'vitest'
import { JUMP_PREFIX } from '../shell/shortcuts'
import { SHELL_CONFIG } from './config'
import { MODULES } from './modules'
import { registry } from './registry'

describe('this workspace', () => {
  it('registers every module it has', () => {
    // A module imported and never listed is invisible, and nothing else fails.
    expect(MODULES.map((m) => m.id)).toEqual([
      'tasks',
      'reading',
      'people',
      'organisations',
      'meetings',
      'communication',
      'notes',
    ])
  })
})

describe("the rail's pinned pages", () => {
  it('are the four that cut across every kind, in reading order', () => {
    expect(registry.pinned.map((p) => p.label)).toEqual([
      'Workbench',
      'Today',
      'Calendar',
      'Review',
    ])
  })

  it('never number more than five', () => {
    expect(SHELL_CONFIG.pinned.length).toBeLessThanOrEqual(5)
  })

  it('each name the chord that goes there, so its key can be shown beside it', () => {
    const keys = new Map(registry.chords.map((c) => [c.id, c.key]))
    expect(registry.pinned.map((p) => (p.chord ? keys.get(p.chord) : undefined))).toEqual([
      'w',
      't',
      'c',
      'v',
    ])
  })
})

describe('the kinds of thing', () => {
  it("are every kind this workspace has, the shell's Projects first", () => {
    expect(registry.kinds.map((k) => k.label)).toEqual([
      'Projects',
      'Tasks',
      'People',
      'Organisations',
      'Meetings',
      'Communication',
      'Reading',
      'Notes',
    ])
  })
})

describe('the workbench widgets', () => {
  it('puts this workspace’s cards in the Workbench’s order', () => {
    expect(registry.widgets.map((w) => w.label)).toEqual([
      'Today',
      'Meetings',
      'Reading',
      'Birthdays',
    ])
  })
})

describe('where another module keeps its things', () => {
  it('answers for every kind of thing the contract names', () => {
    const answered = registry.relations.map((r) => r.type)
    expect([...answered].sort()).toEqual([...OBJECT_TYPES].sort())
    // One answer each: two modules claiming a type would make its route depend on order.
    expect(new Set(answered).size).toBe(answered.length)
  })
})

describe('jump chords', () => {
  const chords = registry.chords

  it('resolves each destination, in the order the help list teaches them', () => {
    // FR-029's table, top to bottom.
    expect(chords.map((c) => c.key).join('')).toBe('wtcvpeomxrn')
    expect(chords.map((c) => c.id)).toEqual([
      'workbench',
      'today',
      'calendar',
      'review',
      'projects',
      'people',
      'organisations',
      'meetings',
      'communication',
      'reading',
      'notes',
    ])
  })

  it('resolves nothing for a key that starts no jump', () => {
    for (const key of ['q', 'g', 'f', 'T', '/', '?', 'b', 'i', 'l'])
      expect(registry.chordFor(key)).toBeNull()
  })

  it('has one target per key and does not use the prefix as a second key', () => {
    // A duplicate key would leave one destination unreachable; `g g` would eat its own prefix.
    expect(new Set(chords.map((c) => c.key)).size).toBe(chords.length)
    expect(new Set(chords.map((c) => c.id)).size).toBe(chords.length)
    expect(chords.map((c) => c.key)).not.toContain(JUMP_PREFIX)
  })

  // A chord's key may be a shortcut of its own elsewhere (`G C` and `c`, `G X` and `x`): the
  // prefix claims the next press before anything else sees it (FR-029).
})
