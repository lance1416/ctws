import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { validate } from '@ctws/palette'

/**
 * THE SIX PROJECT HUES ARE CHECKED BY MACHINE, NOT BY EYE: discriminability is computable, so
 * the computation decides whether projects in the sidebar can be told apart.
 *
 * It reads the real `styles.css` rather than a copy of the hexes, so editing a colour -- or a
 * SURFACE the chips sit on -- re-runs the checks. The validator is vendored at
 * `tools/palette/validate_palette.js`; it is not ours and is not edited here.
 */
const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8')

/** The two theme blocks. Everything before the dark media query is the light `:root`. */
const [light, dark] = (() => {
  const at = css.indexOf('@media (prefers-color-scheme: dark)')
  expect(at, 'styles.css must still have a dark block').toBeGreaterThan(0)
  return [css.slice(0, at), css.slice(at)]
})()

const hexes = (block: string, prefix: string) =>
  [...block.matchAll(new RegExp(String.raw`--color-${prefix}[\w-]*:\s*(#[0-9a-f]{6})`, 'g'))].map(
    (m) => m[1]!,
  )

/** Slots 1..6 in order. Order is load-bearing: slot N must be the same hue in both schemes. */
const palette = (block: string) =>
  [1, 2, 3, 4, 5, 6].map((n) => {
    const m = new RegExp(String.raw`--color-project-${n}:\s*(#[0-9a-f]{6})`).exec(block)
    expect(m, `--color-project-${n} must be a 6-digit hex`).not.toBeNull()
    return m![1]!
  })

describe.each([
  ['light', light, 'light' as const],
  ['dark', dark, 'dark' as const],
])('the %s project palette', (_name, block, mode) => {
  const pal = palette(block)

  // Every surface a chip can land on, not just the page: the rail is chrome, a pane floats and a
  // board column is desk, and a colour that passes on one can fail on another.
  it.each(hexes(block, '(?:sheet|chrome|desk|float)'))(
    'passes every check on surface %s',
    (surface) => {
      // `pairs: 'all'` and not the default 'adjacent': any two projects can sit next to each other
      // in the sidebar, and any two can be compared across a cross-project list.
      const { report, ok } = validate(pal, { mode, surface, pairs: 'all' })
      // Every check PASSES -- not merely "does not fail". The validator lets contrast under 3:1
      // through as a WARN when a label sits beside the colour, and it always does here; a thread
      // is only 3px wide, so it needs the full contrast to be seen.
      const short = (report as [string, boolean | string, string][])
        .filter(([, status]) => status !== true && status !== 'pass')
        .map(([name, status, detail]) => `${name} (${String(status)}): ${detail}`)
      expect(short, `${mode} on ${surface}`).toEqual([])
      expect(ok).toBe(true)
    },
  )
})

it('a slot is the same hue in both schemes, so a project does not change colour with the theme', () => {
  // Hue in OKLCH, which is what "the same colour, re-stepped for the other background" means.
  const hue = (hex: string) => {
    const lin = [0, 2, 4]
      .map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255)
      .map((s) => (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4))
    const [r, g, b] = lin as [number, number, number]
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
    return ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360
  }
  const apart = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

  palette(light).forEach((hex, i) => {
    const drift = apart(hue(hex), hue(palette(dark)[i]!))
    expect(drift, `slot ${i + 1} drifts ${drift.toFixed(1)}° between schemes`).toBeLessThan(3)
  })
})
