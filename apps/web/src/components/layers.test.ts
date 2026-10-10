import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LAYER } from './layers'
import { MENU_SURFACE } from './menuSurface'

/**
 * A MENU PAINTS OVER WHATEVER OPENED IT.
 *
 * A menu opened inside the detail pane renders into a portal at `<body>`. The pane carries a
 * layer, so a menu with none is painted UNDERNEATH it -- in the DOM, answering clicks, and
 * invisible. A click cannot see that: `elementFromPoint` finds the element and reports it on
 * top whatever the paint order.
 *
 * So the invariant is checked where it is expressed: in the numbers.
 */
const order = (cls: string) => Number(/z-(\d+)/.exec(cls)?.[1] ?? '0')

describe('layers', () => {
  it('puts a menu above the pane, a row, and a modal layer', () => {
    expect(order(LAYER.menu)).toBeGreaterThan(order(LAYER.overlay))
    expect(order(LAYER.overlay)).toBeGreaterThan(order(LAYER.row))
    expect(order(LAYER.row)).toBeGreaterThan(order(LAYER.pane))
  })

  it('gives every menu surface that layer', () => {
    expect(order(MENU_SURFACE)).toBe(order(LAYER.menu))
  })

  it('leaves no menu writing its own look, which is how one loses its layer', () => {
    const dir = join(import.meta.dirname)
    const offenders: string[] = []
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.tsx')) continue
      const source = readFileSync(join(dir, name), 'utf8')
      if (!source.includes('DropdownMenu.Content')) continue
      if (!source.includes('MENU_SURFACE')) offenders.push(name)
    }
    expect(offenders, 'these draw a menu without the shared surface').toEqual([])
  })
})

/**
 * THE ONE LAYER THAT CANNOT BE SET IN JSX.
 *
 * Radix's popper wrapper makes its own stacking context, so the class on the menu content never
 * competes with a dialog's scrim. The rule that raises the wrapper is in the stylesheet, and the
 * number in it has to be the same one `LAYER.menu` names -- two places, so this holds them
 * together. Without the rule a menu opened inside a dialog is unclickable and closes the dialog.
 */
describe('the popper wrapper is raised in CSS', () => {
  it('carries the same number LAYER.menu names', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../styles.css'), 'utf8')
    const rule = /\[data-radix-popper-content-wrapper\]\s*\{[^}]*z-index:\s*(\d+)/.exec(css)
    expect(rule, 'styles.css should raise the Radix popper wrapper').toBeTruthy()
    expect(`z-${rule![1]}`).toBe(LAYER.menu)
  })
})

/**
 * NO NATIVE `<select>` IN THE APP.
 *
 * The OS draws a native select's popup, and it does not know this palette: on Windows in dark
 * mode the list came up white with the page's own light-grey text on it -- unreadable, and
 * nothing in CSS reaches inside it. `PickOne` is the app's picker and it is styled here.
 *
 * Read off the source, because a menu nobody opened in a test leaves no trace in the DOM.
 */
describe('the pickers are the app own', () => {
  it('has no native select left in a component', () => {
    const dir = resolve(import.meta.dirname, '..')
    const walk = (at: string): string[] =>
      readdirSync(at, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(at, e.name)) : /\.tsx$/.test(e.name) ? [join(at, e.name)] : [],
      )
    // Comments are stripped first: the prose that records the removal names the thing it
    // removed, and a guard that cannot tell those apart is answered by rewording a comment.
    const code = (text: string) =>
      text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ 	]*\/\/.*$/gm, '')
    const offenders = walk(dir).filter((f) => /<select[\s>]/.test(code(readFileSync(f, 'utf8'))))
    expect(offenders.map((f) => f.slice(dir.length + 1))).toEqual([])
  })
})
