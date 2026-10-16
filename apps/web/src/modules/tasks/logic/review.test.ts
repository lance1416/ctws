import { describe, expect, it } from 'vitest'
import { reviewRows, weekAfter, weekBefore } from './review'

describe('stepping through weeks', () => {
  it('steps back to the whole week before, Monday to Sunday', () => {
    // This week so far is Mon 12 – Wed 14 October 2026.
    expect(weekBefore('2026-10-12')).toEqual({ from: '2026-10-05', to: '2026-10-11' })
  })

  it('steps forward a whole week while that week is still past', () => {
    expect(weekAfter('2026-09-28', '2026-10-12')).toEqual({ from: '2026-10-05', to: '2026-10-11' })
  })

  it('steps forward into this week as the default, never past it', () => {
    expect(weekAfter('2026-10-05', '2026-10-12')).toBeNull()
  })
})

describe("a project's rows", () => {
  it('draws a task started and finished in one week once in each list, under its own key', () => {
    const task = { id: 't1', title: 'Ship', at: '2026-10-14T09:00:00.000Z' }
    const rows = reviewRows({
      projectId: 'p1',
      projectName: 'P',
      finished: [task],
      started: [task],
      dropped: [],
    } as unknown as Parameters<typeof reviewRows>[0])
    expect(rows.map((r) => r.list)).toEqual(['finished', 'started'])
    expect(new Set(rows.map((r) => r.key)).size).toBe(2)
  })
})
