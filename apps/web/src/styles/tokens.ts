import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The colour tokens as `styles.css` declares them, read by the style tests so that editing a
 * colour, a surface or a layer re-runs every measurement. Each token is written once with
 * `light-dark(a, b)`; a token with one value (the project colours) is the same in both schemes.
 */
export const css = readFileSync(resolve(import.meta.dirname, 'styles.css'), 'utf8')

export type Scheme = 'light' | 'dark'

/** `--color-<name>`'s value in `scheme`, or null when the token is not declared. */
export function color(name: string, scheme: Scheme): string | null {
  const m = new RegExp(String.raw`--color-${name}:\s*([^;]+);`).exec(css)
  if (!m) return null
  const value = m[1]!.trim()
  const pair = /^light-dark\((.+)\)$/.exec(value)
  if (!pair) return value
  // Split at the top-level comma: the sides may themselves hold `rgb(r g b / a)`.
  let depth = 0
  for (let i = 0; i < pair[1]!.length; i++) {
    const c = pair[1]![i]
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === ',' && depth === 0) {
      const [a, b] = [pair[1]!.slice(0, i), pair[1]!.slice(i + 1)]
      return (scheme === 'light' ? a : b)!.trim()
    }
  }
  throw new Error(`a light-dark() this test can read: ${value}`)
}

export const rgba = (v: string): [number, number, number, number] => {
  if (v.startsWith('#')) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)) as [
      number,
      number,
      number,
    ]
    return [r, g, b, 1]
  }
  const m = /rgb\(([\d.]+) ([\d.]+) ([\d.]+) \/ ([\d.]+)\)/.exec(v)
  if (!m) throw new Error(`a colour this test can read: ${v}`)
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
}

/** A translucent layer composited over an opaque surface, as the browser paints it. */
export const over = (layer: string, surface: string): string => {
  const [lr, lg, lb, a] = rgba(layer)
  const [sr, sg, sb] = rgba(surface)
  return (
    '#' +
    [
      [lr, sr],
      [lg, sg],
      [lb, sb],
    ]
      .map(([l, s]) => Math.round(l! * a + s! * (1 - a)))
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
  )
}

export const SURFACES = ['ground', 'chrome', 'panel', 'float'] as const
export const KINDS = [
  'task',
  'meeting',
  'person',
  'reading',
  'project',
  'organisation',
  'communication',
  'note',
] as const
export const STATES = ['go', 'warn', 'stop'] as const
