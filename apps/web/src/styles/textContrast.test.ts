import { describe, expect, it } from 'vitest'
import { contrast } from '@ctws/palette'
import { KINDS, STATES, SURFACES, color, over, type Scheme } from './tokens'

/**
 * Every coloured word reads at 4.5:1 wherever it can land. A token that passes on the page can
 * fail on a hovered row, a selected one, the chrome or a float, so each text token is measured
 * against every surface, bare and under each layer, in both schemes.
 *
 * The two greys are held everywhere, a selected row that is also hovered included. One exception,
 * deliberate: a kind's or a state's `-t` is held bare, hovered, and on its own tint laid over each
 * surface bare and hovered (a badge sits in a hovered row); not under `select`.
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

  it('ink and muted pass on every surface, bare, hovered, selected, and selected and hovered', () => {
    expect(failing(['ink', 'muted'], grounds(['hover', 'select']))).toEqual([])
    const both = SURFACES.map((s) => {
      const surface = read(s, scheme)
      return [
        `${s} + select + hover`,
        over(read('hover', scheme), over(read('select', scheme), surface)),
      ] as [string, string]
    })
    expect(failing(['ink', 'muted'], both)).toEqual([])
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

  it("a swiped row's buttons read at 6:1, their words on their fills", () => {
    for (const fill of ['swipe-later', 'swipe-pick', 'swipe-done'])
      expect(contrast(read('on-ink', scheme), read(fill, scheme)), fill).toBeGreaterThanOrEqual(6)
    // Remove is the design's red, held only to AA's 4.5.
    expect(contrast(read('on-ink', scheme), read('swipe-remove', scheme))).toBeGreaterThanOrEqual(
      4.5,
    )
  })

  it("a kind's or a state's main colour shows as an icon (3:1) on every surface, bare, hovered and selected", () => {
    expect(failing([...KINDS, ...STATES], grounds(['hover', 'select']), 3)).toEqual([])
  })

  it('the edge of a field shows (3:1) on every surface', () => {
    expect(failing(['line-strong'], grounds([]), 3)).toEqual([])
  })
})
