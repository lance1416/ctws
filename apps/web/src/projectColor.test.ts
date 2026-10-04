import { describe, expect, it } from 'vitest'
import { PROJECT_HUES, projectHue, projectRailClass } from './projectColor'

// Sequential uuidv7s: what this app actually hands out, and the hard case -- they share a long
// prefix because the leading bits are a timestamp.
const IDS = [
  '01a1061f-31ae-712a-bd39-6f1a8cde0942',
  '01a1061f-31bf-73e8-875c-c90372227ebe',
  '01a1061f-31c9-7285-b61c-337fa98b1f96',
  '01a1061f-b83a-7467-84f8-7989cfcd9e0d',
  '01a1061f-b85d-73e3-97ea-0df5ed58f9e1',
  '01a1061f-b86f-7496-a747-28ffc574a022',
  '0199a0b1-0000-7000-8000-000000000001',
  '0199a0b1-0000-7000-8000-000000000002',
]

describe('projectHue', () => {
  it('always answers a hue that has a token', () => {
    for (const id of IDS) {
      const hue = projectHue(id)
      expect(hue).toBeGreaterThanOrEqual(1)
      expect(hue).toBeLessThanOrEqual(PROJECT_HUES)
      expect(Number.isInteger(hue)).toBe(true)
    }
  })

  it('is stable: the same id always gets the same hue', () => {
    // The rail is meant to be the one thing about a project that never moves, so this is the
    // whole contract. A position- or time-derived colour would fail here.
    for (const id of IDS) expect(projectHue(id)).toBe(projectHue(id))
    expect(projectHue(IDS[0]!)).toBe(projectHue(IDS[0]!.toString()))
  })

  it('spreads ids that differ only in their last characters', () => {
    // The failure this guards: a hash that ignores the tail (or a sum of char codes, which the
    // ordering of a uuid makes nearly constant) hands every project the same colour.
    const near = [
      '0199a0b1-0000-7000-8000-00000000000a',
      '0199a0b1-0000-7000-8000-00000000000b',
      '0199a0b1-0000-7000-8000-00000000000c',
      '0199a0b1-0000-7000-8000-00000000000d',
    ].map(projectHue)
    expect(new Set(near).size).toBeGreaterThan(1)
  })

  it('maps to a literal class Tailwind can see in the source', () => {
    // A template string would compile to nothing, so the component uses a lookup table. This
    // asserts the table agrees with the hue AND that every one of the six entries is reachable:
    // a table missing entry 5 would otherwise go unnoticed until a project happened to hash to it.
    const seen = new Set<string>()
    for (let n = 0; n < 500; n++) {
      const id = `0199a0b1-0000-7000-8000-${String(n).padStart(12, '0')}`
      const cls = projectRailClass(id)
      expect(cls).toBe(`bg-project-${projectHue(id)}`)
      seen.add(cls)
    }
    expect([...seen].sort()).toEqual(
      Array.from({ length: PROJECT_HUES }, (_, i) => `bg-project-${i + 1}`),
    )
  })
})
