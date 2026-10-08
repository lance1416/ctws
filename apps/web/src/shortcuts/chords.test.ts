import { describe, expect, it } from 'vitest'
import { allChords, resolveChord } from '../modules/registry'
import { JUMP_PREFIX } from './chords'

const chords = allChords()

describe('jump chords', () => {
  it('resolves each destination, in the order the help list teaches them', () => {
    // 待读 sits right after 今天: they are the two lists that answer 「现在做什么」, one from
    // each module. The rest is unchanged, which is the point -- a second module contributed a
    // key without the table being rewritten around it.
    // 工作台 leads: it is where `/` lands and the page every other key is a way out of.
    expect(chords.map((c) => c.key).join('')).toBe('wtlmncpri')
    expect(chords.map((c) => c.id)).toEqual([
      'workbench',
      'today',
      'reading',
      'meetings',
      'contacts',
      'calendar',
      'projects',
      'review',
      'inbox',
    ])
  })

  it('resolves nothing for a key that starts no jump', () => {
    for (const key of ['q', 'g', 'f', 'T', '/', '?']) expect(resolveChord(key)).toBeNull()
  })

  it('has one target per key and does not use the prefix as a second key', () => {
    // `g g` would make the chord eat its own prefix, and a duplicate key would make one of the
    // two destinations permanently unreachable -- both silent, both only visible as "that
    // shortcut does nothing". With chords CONTRIBUTED by modules, the duplicate no longer has to
    // be a typo in one table: two modules can each believe `t` is theirs.
    expect(new Set(chords.map((c) => c.key)).size).toBe(chords.length)
    expect(new Set(chords.map((c) => c.id)).size).toBe(chords.length)
    expect(chords.map((c) => c.key)).not.toContain(JUMP_PREFIX)
  })

  it('does not take a key that is already a shortcut of its own', () => {
    // `/` capture, `f` search, `?` help, and `s`/`x`/`j`/`k` on a row. The chord's second key is
    // only read after a `g`, so a collision is not fatal -- but it makes the help overlay lie.
    for (const taken of ['/', 'f', '?', 's', 'x', 'j', 'k']) {
      expect(chords.map((c) => c.key)).not.toContain(taken)
    }
  })
})
