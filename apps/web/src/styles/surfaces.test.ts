import { describe, expect, it } from 'vitest'
import { MENU_SURFACE } from '../platform/ui/menuSurface'
import { SURFACES, color, css, rgba } from './tokens'

/**
 * A state goes one step from the plane it is on, and never to another plane. Both states are ink
 * layers (`hover`, `select`), so they show on every plane: an opaque hover equal to a plane changes
 * nothing on that plane. That no transient state names a surface is the lint's
 * (`ctws/class-names`).
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

  it('in dark, a card is one step lighter than the ground, as in light, and a float one more', () => {
    const lum = (hex: string) =>
      rgba(hex)
        .slice(0, 3)
        .reduce((a, b) => a + b, 0)
    const [ground, chrome, panel, float] = SURFACES.map((s) => lum(color(s, 'dark')!))
    // One ground under the page, the sidebar, the bars: chrome is no step of its own in dark.
    expect(chrome).toBe(ground)
    expect(ground).toBeLessThan(panel!)
    expect(panel).toBeLessThan(float!)
    // The band a head sits on lies between the card and the ground, in both schemes.
    const band = lum(color('band', 'dark')!)
    expect(band).toBeGreaterThan(ground!)
    expect(band).toBeLessThan(panel!)
  })

  it('writes every colour once, for both schemes', () => {
    // One `light-dark()` per token rather than a dark block repeating the list: a token added to
    // one block and not the other would paint the wrong scheme. A scheme's block may hold what is
    // not a colour (the dark icon stroke), never a colour.
    for (const block of css.match(/@media \(prefers-color-scheme[^{]*\{[\s\S]*?\n\}/g) ?? [])
      expect(block.slice(block.indexOf('{'))).not.toMatch(
        /color|background|fill|stroke:|border|shadow|outline/,
      )
    for (const s of SURFACES) expect(color(s, 'light')).not.toEqual(color(s, 'dark'))
  })

  it('floats a menu on the top plane, so it is never darker than what opened it', () => {
    expect(MENU_SURFACE).toContain('bg-float')
  })
})
