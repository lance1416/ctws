import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MENU_SURFACE } from '../platform/ui/menuSurface'

/**
 * A STATE GOES ONE STEP FROM THE PLANE IT IS ON, AND NEVER TO ANOTHER PLANE.
 *
 * Both states are ink LAYERS (`hover`, `select`), so they show on every plane: an opaque hover
 * equal to a plane changes nothing on that plane. That no transient state names a surface is
 * the lint's (`ctws/class-names`).
 */
const css = readFileSync(resolve(import.meta.dirname, 'styles.css'), 'utf8')
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

  it('floats a menu on the top plane, so it is never darker than what opened it', () => {
    expect(MENU_SURFACE).toContain('bg-float')
  })
})
