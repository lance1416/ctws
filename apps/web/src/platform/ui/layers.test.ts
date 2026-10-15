import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LAYER } from './layers'
import { MENU_SURFACE } from './menuSurface'

/**
 * A portalled menu with no layer paints under the pane, invisible yet clickable, and
 * `elementFromPoint` cannot tell. So the numbers are checked.
 */
const order = (cls: string) => Number(/z-(\d+)/.exec(cls)?.[1] ?? '0')

const SRC = resolve(import.meta.dirname, '../..')
const tsx = (at: string): string[] =>
  readdirSync(at, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tsx(join(at, e.name)) : e.name.endsWith('.tsx') ? [join(at, e.name)] : [],
  )

describe('layers', () => {
  it('puts a menu above full-screen writing, the bars, and the pane', () => {
    expect(order(LAYER.menu)).toBeGreaterThan(order(LAYER.cover))
    expect(order(LAYER.cover)).toBeGreaterThan(order(LAYER.bar))
    expect(order(LAYER.bar)).toBeGreaterThan(order(LAYER.pane))
  })

  it('gives every menu surface that layer', () => {
    expect(order(MENU_SURFACE)).toBe(order(LAYER.menu))
  })

  it('leaves no menu writing its own look, which is how one loses its layer', () => {
    const offenders: string[] = []
    for (const file of tsx(SRC)) {
      const source = readFileSync(file, 'utf8')
      if (!source.includes('DropdownMenu.Content')) continue
      if (!source.includes('MENU_SURFACE')) offenders.push(file.slice(SRC.length + 1))
    }
    expect(offenders, 'these draw a menu without the shared surface').toEqual([])
  })

  it('leaves no menu writing its own rows, which is how five menus got four heights', () => {
    const offenders: string[] = []
    for (const file of tsx(SRC)) {
      const source = readFileSync(file, 'utf8')
      if (!source.includes('DropdownMenu.Item')) continue
      if (!source.includes('MENU_ITEM')) offenders.push(file.slice(SRC.length + 1))
    }
    expect(offenders, 'these draw a menu row without the shared one').toEqual([])
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

/**
 * The OS draws a native select's popup and ignores the palette. Read off the source, because an
 * unopened menu leaves nothing in the DOM.
 */
describe('the pickers are the app own', () => {
  it('has no native select left in a component', () => {
    const dir = resolve(import.meta.dirname, '../..')
    const walk = (at: string): string[] =>
      readdirSync(at, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(at, e.name)) : /\.tsx$/.test(e.name) ? [join(at, e.name)] : [],
      )
    // Comments are stripped first, so one that names `<select>` is not an offender.
    const code = (text: string) =>
      text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ 	]*\/\/.*$/gm, '')
    const offenders = walk(dir).filter((f) => /<select[\s>]/.test(code(readFileSync(f, 'utf8'))))
    expect(offenders.map((f) => f.slice(dir.length + 1))).toEqual([])
  })
})
