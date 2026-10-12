import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MENU_SURFACE } from './components/menuSurface'

/**
 * A STATE GOES ONE STEP FROM THE PLANE IT IS ON, AND NEVER TO ANOTHER PLANE.
 *
 * Two ways this broke, both read off the source because a hover nobody pointed at leaves no trace
 * in a screenshot:
 *
 * - The hover was an opaque colour, and in each scheme it was exactly one of the four planes. On
 *   that plane a hovered row, a highlighted search result and a menu item under the keyboard
 *   changed nothing at all.
 * - Nine controls hovered to the page's own ground: in dark they sank to near-black while every
 *   other hover in the app lifts, and in light they were a second grey.
 *
 * So both states are ink LAYERS (`hover`, `select`), and no transient state names a surface.
 */
const css = readFileSync(resolve(import.meta.dirname, 'styles.css'), 'utf8')

const sources = (): string[] => {
  const walk = (at: string): string[] =>
    readdirSync(at, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? walk(join(at, e.name))
        : /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)
          ? [join(at, e.name)]
          : [],
    )
  return walk(import.meta.dirname)
}

describe('surfaces', () => {
  for (const layer of ['hover', 'select'])
    it(`makes ${layer} a layer over the plane, in every scheme`, () => {
      const values = [...css.matchAll(new RegExp(`--color-${layer}:\\s*([^;]+);`, 'g'))].map((m) =>
        m[1]!.trim(),
      )
      // Light, dark under the media query, and dark chosen by hand.
      expect(values).toHaveLength(3)
      for (const v of values)
        expect(v, `an opaque ${layer} is one of the planes`).toMatch(/\/\s*0?\.\d+\)$/)
    })

  // What the pointer, the keyboard or an open menu does is a layer, never one of the surfaces.
  it('leaves no transient state that lands on a surface', () => {
    const transient =
      /\b(?:hover|focus|focus-visible|focus-within|active|aria-expanded|aria-selected|data-\[highlighted\]):bg-(?:sheet|chrome|desk|float)(?![-\w])/g
    const offenders = sources().flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(transient)].map(
        (m) => `${file.slice(import.meta.dirname.length + 1)}: ${m[0]}`,
      ),
    )
    expect(offenders, 'a state goes to `bg-hover`, not the page ground').toEqual([])
  })

  it('floats a menu on the top plane, so it is never darker than what opened it', () => {
    expect(MENU_SURFACE).toContain('bg-float')
  })
})
