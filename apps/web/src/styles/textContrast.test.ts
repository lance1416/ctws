import { describe, expect, it } from 'vitest'
import { contrast } from '@ctws/palette'
import { KINDS, STATES, SURFACES, color, css, over, type Scheme } from './tokens'

/**
 * EVERY COLOURED WORD READS AT 4.5:1 WHEREVER IT CAN LAND (FR-005).
 *
 * A token that passes on the page can fail on a hovered row, a selected one, the chrome or a
 * float. So each text token is measured against every surface, bare and under each layer, in
 * both schemes -- read off the real `styles.css`, so changing a colour or a layer re-runs it.
 *
 * Two exceptions, both deliberate:
 * - `subtle` is held bare and hovered only; on a selection it is lifted to `muted` by a rule in
 *   `styles.css` (checked below). Asking it to pass there on its own would make it the second
 *   grey, and the three greys would be two.
 * - A kind's or a state's `-t` is held bare, hovered, and on its own tint laid over each surface
 *   bare and hovered (a badge sits in a hovered row); not under `select`.
 * That is tokens.md's "对比度怎么量" (DES-001 v1.4), rule for rule.
 */
const read = (name: string, scheme: Scheme) => {
  const v = color(name, scheme)
  expect(v, `--color-${name}`).not.toBeNull()
  return v!
}

describe.each(['light', 'dark'] as const)('text in %s', (scheme) => {
  const grounds = (layers: string[]) =>
    SURFACES.flatMap((s) => {
      const surface = read(s, scheme)
      return [
        [s, surface],
        ...layers.map((l) => [`${s} + ${l}`, over(read(l, scheme), surface)]),
      ] as [string, string][]
    })
  const failing = (tokens: string[], where: [string, string][], floor = 4.5) =>
    tokens.flatMap((t) =>
      where
        .map(([at, bg]) => [at, contrast(read(t, scheme), bg) as number] as const)
        .filter(([, r]) => r < floor)
        .map(([at, r]) => `${t} on ${at}: ${r.toFixed(2)}`),
    )

  it('ink and muted pass on every surface, bare, hovered and selected', () => {
    expect(failing(['ink', 'muted'], grounds(['hover', 'select']))).toEqual([])
  })

  it('the third grey passes bare and hovered', () => {
    expect(failing(['subtle'], grounds(['hover']))).toEqual([])
  })

  it("a kind's and a state's text passes bare, hovered, and on its own tint", () => {
    const fails = [...KINDS, ...STATES].flatMap((k) => {
      const tinted = grounds(['hover']).map(
        ([at, bg]) => [`${k}-bg over ${at}`, over(read(`${k}-bg`, scheme), bg)] as [string, string],
      )
      return failing([`${k}-t`], [...grounds(['hover']), ...tinted])
    })
    expect(fails).toEqual([])
  })

  it('code reads as body text on a block and on the ground, bare and hovered', () => {
    const code = ['keyword', 'string', 'number', 'comment', 'fn', 'attr', 'punct'].map(
      (n) => `code-${n}`,
    )
    const where = grounds(['hover']).filter(([at]) => /^(panel|ground)/.test(at))
    expect(failing(code, where)).toEqual([])
  })

  it('the text of a filled button reads on its fill', () => {
    expect(contrast(read('on-ink', scheme), read('ink', scheme))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(read('on-stop', scheme), read('stop', scheme))).toBeGreaterThanOrEqual(4.5)
  })

  it("a kind's or a state's main colour shows as an icon (3:1) on every surface, bare, hovered and selected", () => {
    expect(failing([...KINDS, ...STATES], grounds(['hover', 'select']), 3)).toEqual([])
  })

  it('the edge of a field shows (3:1) on every surface', () => {
    expect(failing(['line-strong'], grounds([]), 3)).toEqual([])
  })
})

it('lifts the third grey to the second on whatever is selected', () => {
  const rule =
    /((?:\[aria-[a-z]+='[a-z]+'\] \.text-subtle,?\s*)+)\{\s*color:\s*var\(--color-muted\)/
  const m = rule.exec(css)
  expect(m, 'the rule that lifts subtle on a selected surface').not.toBeNull()
  for (const state of ["aria-current='page'", "aria-pressed='true'", "aria-selected='true'"])
    expect(m![1]).toContain(`[${state}] .text-subtle`)
})
