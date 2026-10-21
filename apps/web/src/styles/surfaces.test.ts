import { describe, expect, it } from 'vitest'
import { MENU_SURFACE } from '../platform/ui/menuSurface'
import { SURFACES, color, css, rgba } from './tokens'

/**
 * A STATE GOES ONE STEP FROM THE PLANE IT IS ON, AND NEVER TO ANOTHER PLANE.
 *
 * Both states are ink LAYERS (`hover`, `select`), so they show on every plane: an opaque hover
 * equal to a plane changes nothing on that plane. That no transient state names a surface is
 * the lint's (`ctws/class-names`).
 */
describe('surfaces', () => {
  for (const layer of ['hover', 'select'])
    it(`makes ${layer} a layer over the plane, in every scheme`, () => {
      for (const scheme of ['light', 'dark'] as const) {
        const v = color(layer, scheme)
        expect(v, `--color-${layer} in ${scheme}`).not.toBeNull()
        expect(rgba(v!)[3], `an opaque ${layer} is one of the planes`).toBeLessThan(1)
      }
    })

  it('stacks the four surfaces by lightness in dark, so a float needs no shadow there (FR-005)', () => {
    const lum = (hex: string) =>
      rgba(hex)
        .slice(0, 3)
        .reduce((a, b) => a + b, 0)
    const [ground, chrome, panel, float] = SURFACES.map((s) => lum(color(s, 'dark')!))
    expect(ground).toBeLessThan(chrome!)
    expect(chrome).toBeLessThan(panel!)
    expect(panel).toBeLessThan(float!)
  })

  it('writes every colour once, for both schemes', () => {
    // One `light-dark()` per token rather than a dark block repeating the list: a token added to
    // one block and not the other would paint the wrong scheme.
    expect(css).not.toMatch(/prefers-color-scheme/)
    for (const s of SURFACES) expect(color(s, 'light')).not.toEqual(color(s, 'dark'))
  })

  it('floats a menu on the top plane, so it is never darker than what opened it', () => {
    expect(MENU_SURFACE).toContain('bg-float')
  })
})
