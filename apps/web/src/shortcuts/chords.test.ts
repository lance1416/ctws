import { describe, expect, it } from 'vitest'
import { JUMP_PREFIX, JUMPS, resolveJump } from './chords'

describe('jump chords', () => {
  it('resolves each of the four destinations', () => {
    expect(resolveJump('t')).toBe('today')
    expect(resolveJump('p')).toBe('projects')
    expect(resolveJump('d')).toBe('completed')
    expect(resolveJump('i')).toBe('inbox')
  })

  it('resolves nothing for a key that starts no jump', () => {
    for (const key of ['q', 'g', 'f', 'T', '/', '?']) expect(resolveJump(key)).toBeNull()
  })

  it('has one target per key and does not use the prefix as a second key', () => {
    // `g g` would make the chord eat its own prefix, and a duplicate key would make one of the
    // two destinations permanently unreachable -- both silent, both only visible as "that
    // shortcut does nothing".
    expect(new Set(JUMPS.map((j) => j.key)).size).toBe(JUMPS.length)
    expect(new Set(JUMPS.map((j) => j.target)).size).toBe(JUMPS.length)
    expect(JUMPS.map((j) => j.key)).not.toContain(JUMP_PREFIX)
  })

  it('does not take a key that is already a shortcut of its own', () => {
    // `/` capture, `f` search, `?` help, and `s`/`x`/`j`/`k` on a row. The chord's second key is
    // only read after a `g`, so a collision is not fatal -- but it makes the help overlay lie.
    for (const taken of ['/', 'f', '?', 's', 'x', 'j', 'k']) {
      expect(JUMPS.map((j) => j.key)).not.toContain(taken)
    }
  })
})
