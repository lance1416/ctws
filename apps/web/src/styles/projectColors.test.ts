import { describe, expect, it } from 'vitest'
import { contrast } from '@ctws/palette'
import { color } from './tokens'

/**
 * THE EIGHT PROJECT COLOURS ARE CHECKED BY MACHINE, NOT BY EYE (FR-004, tokens.md "项目",
 * DES-001 v1.3). A project is a solid square with white initials and its name beside it, so the
 * rules are the square's: the initials read, the colour is a colour, the squares weigh the same,
 * and any two can be told apart. Colour-blind distance and 3:1 on the ground are deliberately not
 * asked; the initials and the name carry what the colour cannot (tokens.md, "代价").
 *
 * It reads the real `styles.css`, so editing a colour re-runs the checks.
 */
const NAMES = ['blue', 'amber', 'green', 'violet', 'red', 'olive', 'teal', 'pink'] as const

const palette = (scheme: 'light' | 'dark') =>
  NAMES.map((n) => {
    const v = color(`project-${n}`, scheme)
    expect(v, `--color-project-${n} must be a 6-digit hex`).toMatch(/^#[0-9a-f]{6}$/)
    return v!
  })

/** OKLab of an sRGB hex, as the palette validator and tokens.md compute it. */
function oklab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}
const chroma = (hex: string) => Math.hypot(oklab(hex)[1], oklab(hex)[2])
/** ΔE in OKLab, times 100. */
const distance = (a: string, b: string) => {
  const [p, q] = [oklab(a), oklab(b)]
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * 100
}

const pal = palette('light')
const named = NAMES.map((n, i) => [n, pal[i]!] as const)

describe('the project colours (FR-004)', () => {
  it('read white initials at 4.5:1 on every square', () => {
    const fails = named
      .map(([n, hex]) => [n, contrast('#ffffff', hex) as number] as const)
      .filter(([, r]) => r < 4.5)
      .map(([n, r]) => `${n}: ${r.toFixed(2)}`)
    expect(fails).toEqual([])
  })

  it('are colours, not greys: OKLCH chroma at least 0.10', () => {
    const fails = named
      .filter(([, hex]) => chroma(hex) < 0.1 - 1e-4)
      .map(([n, hex]) => `${n}: ${chroma(hex).toFixed(3)}`)
    expect(fails).toEqual([])
  })

  it('weigh the same: OKLCH lightness between 0.49 and 0.58', () => {
    const fails = named
      .map(([n, hex]) => [n, oklab(hex)[0]] as const)
      .filter(([, l]) => l < 0.49 || l > 0.58)
      .map(([n, l]) => `${n}: ${l.toFixed(3)}`)
    expect(fails).toEqual([])
  })

  it('can be told apart: any two at least 12 apart (OKLab ΔE × 100), every pair', () => {
    const fails = named.flatMap(([a, x], i) =>
      named
        .slice(i + 1)
        .filter(([, y]) => distance(x, y) < 12 - 0.05)
        .map(([b, y]) => `${a}/${b}: ${distance(x, y).toFixed(1)}`),
    )
    expect(fails).toEqual([])
  })

  it('are the same hex in both schemes, so a project keeps its colour with the theme', () => {
    expect(palette('dark')).toEqual(pal)
  })
})
