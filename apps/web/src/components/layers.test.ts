import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LAYER } from './layers'
import { MENU_SURFACE } from './menuSurface'

/**
 * A MENU PAINTS OVER WHATEVER OPENED IT.
 *
 * A menu opened inside the detail pane renders into a portal at `<body>`. The pane carries a
 * layer; three of the five menus carried none, so they were painted UNDERNEATH it -- in the DOM,
 * answering clicks, and invisible. Nothing caught it: a headless click finds the element and
 * reports it on top, because paint order is not what `elementFromPoint` is deciding.
 *
 * So the invariant is checked where it is actually expressed: in the numbers.
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

  it('leaves no menu writing its own look, which is how three lost their layer', () => {
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
