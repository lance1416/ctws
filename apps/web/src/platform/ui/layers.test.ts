import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LAYER } from './layers'
import { MENU_SURFACE } from './menuSurface'

/**
 * A portalled menu with no layer paints under the pane, invisible yet clickable, and
 * `elementFromPoint` cannot tell. So the numbers are checked.
 */
const order = (cls: string) => Number(/z-(\d+)/.exec(cls)?.[1] ?? '0')

describe('layers', () => {
  it('puts a menu above full-screen writing, the bars, and the pane', () => {
    expect(order(LAYER.menu)).toBeGreaterThan(order(LAYER.cover))
    expect(order(LAYER.cover)).toBeGreaterThan(order(LAYER.bar))
    expect(order(LAYER.bar)).toBeGreaterThan(order(LAYER.pane))
  })

  it('gives every menu surface that layer', () => {
    expect(order(MENU_SURFACE)).toBe(order(LAYER.menu))
  })
})

/**
 * Radix's popper wrapper is its own stacking context, so its layer is set in the stylesheet.
 * Without it a menu opened inside a dialog cannot be clicked.
 */
describe('the popper wrapper is raised in CSS', () => {
  it('carries the same number LAYER.menu names', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../../styles/styles.css'), 'utf8')
    const rule = /\[data-radix-popper-content-wrapper\]\s*\{[^}]*z-index:\s*(\d+)/.exec(css)
    expect(rule, 'styles.css should raise the Radix popper wrapper').toBeTruthy()
    expect(`z-${rule![1]}`).toBe(LAYER.menu)
  })
})
