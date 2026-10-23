import { describe, expect, it } from 'vitest'
import { followUpWords } from './followUp'

/** Thursday, October 22, 2026: given, never read off the clock. */
const TODAY = '2026-10-22'

describe('followUpWords', () => {
  it('says the day as a deadline chip does: Today, Tomorrow, the weekday, then the date', () => {
    expect(followUpWords('2026-10-22', TODAY)).toEqual({ text: 'Today', late: false })
    expect(followUpWords('2026-10-23', TODAY)).toEqual({ text: 'Tomorrow', late: false })
    expect(followUpWords('2026-10-24', TODAY)).toEqual({ text: 'Sat', late: false })
    expect(followUpWords('2026-10-28', TODAY)).toEqual({ text: 'Wed', late: false })
    expect(followUpWords('2026-10-29', TODAY)).toEqual({ text: 'Oct 29', late: false })
  })

  it('is late once the day has passed, as Yesterday or the date', () => {
    expect(followUpWords('2026-10-21', TODAY)).toEqual({ text: 'Yesterday', late: true })
    expect(followUpWords('2026-10-15', TODAY)).toEqual({ text: 'Oct 15', late: true })
  })
})
