import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrast } from '@ctws/palette'

/**
 * EVERY COLOURED WORD READS AT 4.5:1 WHEREVER IT CAN LAND.
 *
 * A token that passes on the page can fail on a hovered row, a selected one, the rail or a sheet:
 * the plan colour measured 4.55 on paper and 3.31 on a selected row on the desk. So each text
 * token is measured against every surface, bare and under each layer, in every scheme -- read off
 * the real `styles.css`, so changing a colour or a layer re-runs it.
 *
 * The third grey is the one exception, on the select layer only: there it is lifted to the second
 * grey by a rule in `styles.css` (checked below). Asking it to pass there on its own would make it
 * the second grey, and the three greys would be two.
 */
const css = readFileSync(resolve(import.meta.dirname, 'styles.css'), 'utf8')

const schemes = (() => {
  const media = css.indexOf('@media (prefers-color-scheme: dark)')
  const chosen = css.indexOf(":root[data-theme='dark']")
  expect(media, 'styles.css must still have a dark block').toBeGreaterThan(0)
  expect(chosen, 'styles.css must still have the hand-picked dark block').toBeGreaterThan(media)
  return {
    light: css.slice(0, media),
    'dark (system)': css.slice(media, chosen),
    'dark (chosen)': css.slice(chosen, css.indexOf('}', chosen)),
  }
})()

const read = (block: string, name: string) => {
  const m = new RegExp(String.raw`--color-${name}:\s*([^;]+);`).exec(block)
  expect(m, `--color-${name}`).not.toBeNull()
  return m![1]!.trim()
}
const rgba = (v: string): [number, number, number, number] => {
  if (v.startsWith('#')) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)) as [
      number,
      number,
      number,
    ]
    return [r, g, b, 1]
  }
  const m = /rgb\(([\d.]+) ([\d.]+) ([\d.]+) \/ ([\d.]+)\)/.exec(v)
  expect(m, `a colour this test can read: ${v}`).not.toBeNull()
  return [Number(m![1]), Number(m![2]), Number(m![3]), Number(m![4])]
}
/** A translucent layer composited over an opaque surface, as the browser paints it. */
const over = (layer: string, surface: string) => {
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

const SURFACES = ['sheet', 'chrome', 'desk', 'float']
const TEXT = ['ink', 'ink-muted', 'plan', 'deadline', 'missed', 'danger']

describe.each(Object.entries(schemes))('text in %s', (_name, block) => {
  const grounds = (layers: string[]) =>
    SURFACES.flatMap((s) => {
      const surface = read(block, s)
      return [
        [s, surface],
        ...layers.map((l) => [`${s} + ${l}`, over(read(block, l), surface)]),
      ] as [string, string][]
    })

  it('every coloured word passes on every surface, bare, hovered and selected', () => {
    const fails = TEXT.flatMap((t) =>
      grounds(['hover', 'select'])
        .map(([where, bg]) => [where, contrast(read(block, t), bg) as number] as const)
        .filter(([, r]) => r < 4.5)
        .map(([where, r]) => `${t} on ${where}: ${r.toFixed(2)}`),
    )
    expect(fails).toEqual([])
  })

  it('the third grey passes bare and hovered', () => {
    const fails = grounds(['hover'])
      .map(([where, bg]) => [where, contrast(read(block, 'ink-subtle'), bg) as number] as const)
      .filter(([, r]) => r < 4.5)
      .map(([where, r]) => `ink-subtle on ${where}: ${r.toFixed(2)}`)
    expect(fails).toEqual([])
  })
})

it('lifts the third grey to the second on whatever is selected', () => {
  const rule =
    /((?:\[aria-[a-z]+='[a-z]+'\] \.text-ink-subtle,?\s*)+)\{\s*color:\s*var\(--color-ink-muted\)/
  const m = rule.exec(css)
  expect(m, 'the rule that lifts ink-subtle on a selected surface').not.toBeNull()
  for (const state of ["aria-current='page'", "aria-pressed='true'", "aria-selected='true'"])
    expect(m![1]).toContain(`[${state}] .text-ink-subtle`)
})
