import { describe, expect, it } from 'vitest'
import { dayTimeline, lengthOf, minutesOf, type TimedItem } from './dayLine'

const meeting = (key: string, start: string, end: string): TimedItem => ({
  key,
  kind: 'meeting',
  title: key,
  start: minutesOf(start),
  end: minutesOf(end),
})
const due = (key: string, at: string): TimedItem => ({
  key,
  kind: 'due',
  title: key,
  start: minutesOf(at),
})

describe('the day timeline (FR-079)', () => {
  it('runs 08 to 20, with now, the free stretch and the things in their places', () => {
    // The acceptance: 09:10, a 14:00 meeting, an 18:00 deadline.
    const line = dayTimeline(
      [meeting('screen', '14:00', '15:00'), due('round', '18:00')],
      minutesOf('09:10'),
    )
    expect([line.fromHour, line.toHour]).toEqual([8, 20])
    expect(line.ticks.map((t) => t.hour)).toEqual([8, 10, 12, 14, 16, 18, 20])
    expect(line.now).toBeCloseTo(70 / 720)
    expect(line.free).toEqual({ at: 70 / 720, until: 360 / 720, minutes: 290 })
    expect(lengthOf(line.free!.minutes)).toBe('4h 50m')
    expect(line.nodes.map((n) => [n.key, n.at, n.until])).toEqual([
      ['screen', 0.5, 420 / 720],
      ['round', 600 / 720, 600 / 720],
    ])
    // Each node's words stop where the next begins.
    expect(line.nodes[0]!.room).toBe(600 / 720)
  })

  it('reaches out to the hour of anything earlier or later', () => {
    const line = dayTimeline([meeting('early', '07:30', '08:00'), due('late', '21:15')], 600)
    expect([line.fromHour, line.toHour]).toEqual([7, 22])
    expect(line.ticks[0]).toEqual({ hour: 7, at: 0 })
  })

  it('has nothing free while something is on, and no now outside the line', () => {
    expect(dayTimeline([meeting('m', '09:00', '10:00')], minutesOf('09:30')).free).toBeNull()
    const night = dayTimeline([due('d', '18:00')], minutesOf('23:00'))
    expect(night.now).toBeNull()
    expect(night.free).toBeNull()
  })

  it('draws things too close to read apart as one node (FR-015)', () => {
    const line = dayTimeline(
      [
        meeting('a', '10:00', '10:30'),
        meeting('b', '10:30', '11:00'),
        meeting('c', '13:00', '14:00'),
      ],
      0,
    )
    expect(line.nodes.map((n) => n.items.map((i) => i.key))).toEqual([['a', 'b'], ['c']])
    expect(line.nodes[0]!.until).toBe((11 * 60 - 480) / 720)
  })

  it('says a length the short way', () => {
    expect(lengthOf(50)).toBe('50m')
    expect(lengthOf(120)).toBe('2h')
    expect(lengthOf(0)).toBe('0m')
  })
})

describe('what is too close to read apart, on a line of a given width (U-09)', () => {
  const calls = ['09:00', '10:00', '11:00', '12:00'].map((t, i) =>
    meeting(`Call ${i + 1}`, t, t.replace(/:00$/, ':30')),
  )

  it('keeps hours apart on a wide line', () => {
    expect(dayTimeline(calls, minutesOf('08:30'), 2000).nodes).toHaveLength(4)
    // Today's line at 1440 with nothing beside it: about 1100 across.
    expect(dayTimeline(calls, minutesOf('08:30'), 1100).nodes).toHaveLength(4)
  })

  it('makes one node of them on a narrow one, each a neighbour of the next', () => {
    const nodes = dayTimeline(calls, minutesOf('08:30'), 700).nodes
    expect(nodes).toHaveLength(1)
    expect(nodes[0]!.items).toHaveLength(4)
  })
})
