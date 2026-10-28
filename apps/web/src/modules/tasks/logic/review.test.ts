import { describe, expect, it } from 'vitest'
import { barShare, cellLines, weekStep, weeksByMonth } from './review'

describe('stepping through weeks', () => {
  it('steps back a week, and forward while that week is past', () => {
    expect(weekStep('2026-10-12', -1, '2026-10-19')).toBe('2026-10-05')
    expect(weekStep('2026-10-05', 1, '2026-10-19')).toBe('2026-10-12')
  })

  it('steps forward into this week as the default, never past it', () => {
    expect(weekStep('2026-10-12', 1, '2026-10-19')).toBeNull()
  })
})

type Moved = Parameters<typeof cellLines>[0][number]

const task = (id: string, parent: string | null = null) =>
  ({
    id,
    title: id,
    at: '2026-10-14T09:00:00.000Z',
    parent: parent ? { id: parent, title: parent } : null,
  }) as Moved

describe("a cell's lines", () => {
  it('tells the leaves of one parent as one line, the biggest first', () => {
    const lines = cellLines(
      [
        task('a', 'Redesign'),
        task('b', 'Backend'),
        task('c', 'Redesign'),
        task('d', 'Backend'),
        task('e', 'Redesign'),
        task('Release'),
      ],
      new Set(),
    )
    expect(
      lines.map((l) => (l.kind === 'parent' ? `${l.parent.title} ${l.tasks.length}` : l.task.id)),
    ).toEqual(['Redesign 3', 'Backend 2', 'Release'])
  })

  it('leaves a lone leaf as itself, unless its parent closed with it', () => {
    expect(cellLines([task('a', 'Bugs')], new Set())[0]!.kind).toBe('task')
    expect(cellLines([task('a', 'Bugs')], new Set(['Bugs']))[0]!.kind).toBe('parent')
  })
})

describe('the weeks', () => {
  it('fall under the month their Monday is in', () => {
    const months = weeksByMonth([
      { from: '2026-10-19' },
      { from: '2026-10-05' },
      { from: '2026-09-28' },
    ])
    expect(months.map((m) => [m.month, m.weeks.length])).toEqual([
      ['2026-10', 2],
      ['2026-09', 1],
    ])
  })

  it('draw their bars on one scale, the busiest full', () => {
    expect(barShare(25, 25)).toBe(100)
    expect(barShare(14, 25)).toBe(56)
    expect(barShare(0, 0)).toBe(0)
  })
})
