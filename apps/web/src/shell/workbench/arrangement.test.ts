import { describe, expect, it } from 'vitest'
import { arrangement } from './arrangement'

const at = (columns: number) =>
  Object.fromEntries(arrangement(columns).places.map((p) => [p.place, p.style]))

describe('the workbench arrangement', () => {
  it('puts each place where artboard 10 has it, on six columns', () => {
    const six = at(6)
    expect(six.now).toEqual({ gridColumn: '1 / span 2', gridRow: '1 / span 2' })
    expect(six.week).toEqual({ gridColumn: '1 / span 2', gridRow: '3 / span 1' })
    expect(six.launcher).toEqual({ gridColumn: '3 / span 2', gridRow: '1 / span 1' })
    expect(six.quickNote).toEqual({ gridColumn: '3 / span 2', gridRow: '2 / span 2' })
    expect([six.meetings, six.awaiting, six.birthdays].map((s) => s?.gridColumn)).toEqual([
      '5 / span 1',
      '5 / span 1',
      '5 / span 1',
    ])
    expect([six.weather, six.music, six.reading].map((s) => s?.gridRow)).toEqual([
      '1 / span 1',
      '2 / span 1',
      '3 / span 1',
    ])
  })

  it('fills any other width in the 1440 order, rows of 236', () => {
    const three = arrangement(3)
    expect(three.places.map((p) => p.place)).toEqual([
      'now',
      'meetings',
      'awaiting',
      'launcher',
      'birthdays',
      'week',
      'reading',
      'quickNote',
      'weather',
      'music',
    ])
    expect(three.grid).toMatchObject({ gridAutoRows: '236px', gridAutoFlow: 'row dense' })
  })

  it('leaves what is not built off a phone', () => {
    expect(arrangement(1).places.map((p) => p.place)).toEqual([
      'now',
      'meetings',
      'awaiting',
      'launcher',
      'birthdays',
      'week',
      'reading',
    ])
  })
})
