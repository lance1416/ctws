import { describe, expect, it } from 'vitest'
import { columnsIn } from './columns'

// The main area's width on each screen: the window less the 52 icon bar and the 20 on each side.
const MAIN = (screen: number) => screen - 52 - 40

describe('columnsIn', () => {
  it('gives the three screens the columns DES-001 names for them', () => {
    expect(columnsIn(MAIN(1440))).toBe(3)
    expect(columnsIn(MAIN(1920))).toBe(4)
    expect(columnsIn(MAIN(2560))).toBe(6)
  })

  it('counts a column only when all 360 of it fit, gaps included', () => {
    expect(columnsIn(360 * 3 + 12 * 2)).toBe(3)
    expect(columnsIn(360 * 3 + 12 * 2 - 1)).toBe(2)
  })

  it('never drops below one column or goes past six', () => {
    expect(columnsIn(200)).toBe(1)
    expect(columnsIn(0)).toBe(1)
    expect(columnsIn(5000)).toBe(6)
  })
})
